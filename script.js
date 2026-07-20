// ==========================================
// 1. KHỞI TẠO BIẾN VÀ DOM ELEMENTS
// ==========================================
const ROOM_PREFIX = "WITCH_";
let peer = null;
let isTeacher = false;
let myName = "";
let roomCode = "";

// Cấu hình WebRTC (Sử dụng STUN servers của Google để tăng tỷ lệ kết nối thành công)
const peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    },
    debug: 2
};

// State của Giáo viên
let students = {}; // Format: { peerId: { name, score, online, conn } }
let isGameActive = false;

// State của Học sinh
let currentQuestionIndex = 0;
let hostConn = null;

// Dữ liệu học thuật (Thì Quá khứ đơn)
const questions = [
    { q: "Yesterday, I ______ to the library after school.", options: ["go", "went", "goes", "going"], ans: 1 },
    { q: "My parents ______ dinner at a restaurant last Saturday.", options: ["have", "had", "has", "having"], ans: 1 },
    { q: "______ your brother watch TV last night?", options: ["Do", "Does", "Did", "Was"], ans: 2 },
    { q: "We ______ football yesterday because it rained all day.", options: ["don't play", "didn't play", "aren't playing", "won't play"], ans: 1 },
    { q: "She ______ a beautiful picture for her art class yesterday.", options: ["draws", "drew", "draw", "drawing"], ans: 1 },
    { q: "Last weekend, the students ______ the school garden.", options: ["clean", "cleaned", "cleans", "cleaning"], ans: 1 },
    { q: "Where ______ you go during your summer holiday?", options: ["do", "does", "did", "were"], ans: 2 },
    { q: "Tom ______ his homework before he went to bed.", options: ["finishes", "finished", "finish", "finishing"], ans: 1 },
    { q: "My friends ______ any homework yesterday evening.", options: ["didn't have", "don't have", "doesn't have", "haven't"], ans: 0 },
    { q: "Which sentence is correct?", options: ["She didn't went to school yesterday.", "She doesn't go to school yesterday.", "She didn't go to school yesterday.", "She not go to school yesterday."], ans: 2 }
];

// Helper: Chuyển màn hình
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
    document.getElementById(screenId).classList.add('fade-in');
}

// ==========================================
// 2. LUỒNG GIÁO VIÊN (HOST)
// ==========================================
document.getElementById('btn-create-room').addEventListener('click', () => {
    isTeacher = true;
    switchScreen('screen-teacher-lobby');
    
    // Sinh mã ngẫu nhiên 6 ký tự (bỏ O, 0, I, 1 dễ nhầm)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    roomCode = "";
    for(let i=0; i<6; i++) roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('display-room-code').innerText = roomCode;

    // Khởi tạo PeerJS Server với cấu hình STUN
    peer = new Peer(ROOM_PREFIX + roomCode, peerConfig);
    
    peer.on('open', (id) => {
        console.log("Phòng đã mở với ID: " + id);
    });

    // Xử lý khi có học sinh kết nối vào
    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data.type === 'JOIN') {
                handleStudentJoin(conn, data.name);
            } else if (data.type === 'SCORE_UPDATE') {
                if(students[conn.peer]) {
                    students[conn.peer].score += data.score;
                    broadcastLeaderboard();
                }
            }
        });

        conn.on('close', () => {
            if(students[conn.peer]) {
                students[conn.peer].online = false; // Đánh dấu rớt mạng
                updateTeacherLobbyUI();
                if(isGameActive) broadcastLeaderboard();
            }
        });
    });
});

function handleStudentJoin(conn, rawName) {
    let name = rawName.trim();
    // Xử lý trùng tên: Tự thêm hậu tố (VD: Nam 2)
    let existingNames = Object.values(students).map(s => s.name);
    let suffix = 2;
    let finalName = name;
    while(existingNames.includes(finalName)) {
        finalName = name + " " + suffix;
        suffix++;
    }

    students[conn.peer] = { name: finalName, score: 0, online: true, conn: conn };
    
    // Trả lời cho học sinh
    conn.send({ type: 'JOIN_RESULT', status: 'ok', name: finalName });
    
    // Đồng bộ phòng chờ
    updateTeacherLobbyUI();
    broadcast({ type: 'SYNC_LOBBY', players: Object.values(students).map(s => s.name) });
    document.getElementById('btn-start-game').disabled = false;
}

function updateTeacherLobbyUI() {
    const list = document.getElementById('teacher-student-list');
    list.innerHTML = "";
    let count = 0;
    Object.values(students).forEach(s => {
        if(s.online) {
            count++;
            const li = document.createElement('li');
            li.innerText = "👦 " + s.name;
            list.appendChild(li);
        }
    });
    document.getElementById('teacher-student-count').innerText = count;
}

function broadcast(data) {
    Object.values(students).forEach(s => {
        if(s.online && s.conn && s.conn.open) {
            s.conn.send(data);
        }
    });
}

function broadcastLeaderboard() {
    let sorted = Object.values(students).map(s => ({
        name: s.name, score: s.score, online: s.online
    })).sort((a,b) => b.score - a.score); // Sắp xếp giảm dần

    // Cập nhật giao diện GV
    renderLeaderboard(sorted, 'live-leaderboard-list');
    
    // Gửi cho học sinh
    broadcast({ type: 'LEADERBOARD_UPDATE', leaderboard: sorted });
}

document.getElementById('btn-start-game').addEventListener('click', () => {
    isGameActive = true;
    switchScreen('screen-game');
    document.getElementById('btn-end-game').classList.remove('hidden'); // Hiển thị nút kết thúc cho GV
    document.getElementById('bgm').play(); // Bật nhạc
    
    broadcast({ type: 'GAME_START' });
    broadcastLeaderboard();
});

document.getElementById('btn-end-game').addEventListener('click', () => {
    let sorted = Object.values(students).map(s => ({
        name: s.name, score: s.score, online: s.online
    })).sort((a,b) => b.score - a.score);
    
    broadcast({ type: 'GAME_END', leaderboard: sorted });
    showPodium(sorted);
});

// GV đóng trình duyệt đột ngột
window.addEventListener('beforeunload', () => {
    if(isTeacher) broadcast({ type: 'ROOM_CLOSED' });
});

// ==========================================
// 3. LUỒNG HỌC SINH (CLIENT)
// ==========================================
document.getElementById('btn-join-room-ui').addEventListener('click', () => {
    switchScreen('screen-student-join');
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    const name = document.getElementById('input-student-name').value.trim();
    const errorMsg = document.getElementById('join-error-msg');
    
    if(code.length !== 6 || name === "") {
        errorMsg.innerText = "Vui lòng nhập đủ mã phòng (6 ký tự) và tên!";
        return;
    }
    
    errorMsg.innerText = "Đang kết nối...";
    peer = new Peer(peerConfig);
    
    peer.on('open', () => {
        hostConn = peer.connect(ROOM_PREFIX + code);
        
        hostConn.on('open', () => {
            hostConn.send({ type: 'JOIN', name: name });
        });

        hostConn.on('data', (data) => {
            if(data.type === 'JOIN_RESULT') {
                if(data.status === 'ok') {
                    myName = data.name; // Cập nhật tên (nếu bị GV đổi do trùng)
                    switchScreen('screen-student-waiting');
                }
            } else if (data.type === 'SYNC_LOBBY') {
                const list = document.getElementById('student-waiting-list');
                list.innerHTML = "";
                data.players.forEach(p => {
                    const li = document.createElement('li');
                    li.innerText = "⭐ " + p;
                    list.appendChild(li);
                });
            } else if (data.type === 'GAME_START') {
                startStudentGame();
            } else if (data.type === 'LEADERBOARD_UPDATE') {
                renderLeaderboard(data.leaderboard, 'live-leaderboard-list');
            } else if (data.type === 'GAME_END') {
                showPodium(data.leaderboard);
            } else if (data.type === 'ROOM_CLOSED') {
                alert("Giáo viên đã đóng phòng!");
                window.location.reload();
            }
        });

        hostConn.on('close', () => {
            alert("Mất kết nối tới Giáo viên!");
        });
    });

    peer.on('error', (err) => {
        if(err.type === 'peer-unavailable') {
            errorMsg.innerText = "Không tìm thấy phòng! Vui lòng kiểm tra lại mã.";
        } else {
            errorMsg.innerText = "Lỗi mạng: " + err.message;
        }
    });
});

// ==========================================
// 4. GAMEPLAY LOGIC & ANIMATIONS
// ==========================================
function startStudentGame() {
    switchScreen('screen-game');
    document.getElementById('student-quiz-ui').classList.remove('hidden');
    document.getElementById('bgm').play();
    currentQuestionIndex = 0;
    renderQuestion();
}

function renderQuestion() {
    if(currentQuestionIndex >= questions.length) {
        // Đã trả lời hết
        document.getElementById('student-quiz-ui').classList.add('hidden');
        document.getElementById('student-finished-overlay').classList.remove('hidden');
        return;
    }

    const qData = questions[currentQuestionIndex];
    document.getElementById('quiz-question').innerText = `Câu ${currentQuestionIndex + 1}: ${qData.q}`;
    
    const container = document.getElementById('quiz-options-container');
    container.innerHTML = "";
    
    qData.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(index, qData.ans);
        container.appendChild(btn);
    });
}

function handleAnswer(selectedIndex, correctIndex) {
    // Vô hiệu hóa nút để tránh spam
    document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
    
    const spritePea = document.getElementById('sprite-pea');
    const spriteCat = document.getElementById('sprite-cat');
    const spriteGold = document.getElementById('sprite-gold');
    
    if(selectedIndex === correctIndex) {
        // TRẢ LỜI ĐÚNG
        document.getElementById('sfx-correct').play();
        setTimeout(() => document.getElementById('sfx-drop').play(), 100);
        setTimeout(() => document.getElementById('sfx-jump').play(), 500);
        
        // Phát kẹo ngẫu nhiên
        spriteGold.src = Math.random() > 0.5 ? 'assets/Gold_1.png' : 'assets/Gold_2.png';
        spriteGold.classList.remove('hidden');
        spriteGold.classList.add('anim-drop-gold');
        
        // Hạt đậu nhảy
        spritePea.src = 'assets/pea_jump.png';
        spritePea.classList.add('anim-jump');

        // Gửi điểm lên GV
        hostConn.send({ type: 'SCORE_UPDATE', score: 10 });

        setTimeout(() => {
            // Thêm kẹo vĩnh viễn vào giỏ
            const staticGold = document.createElement('img');
            staticGold.src = spriteGold.src;
            staticGold.className = 'accumulated-gold';
            const rLeft = 38 + Math.random() * 8; // Random vị trí ngang trong giỏ
            const rBottom = -5 + Math.random() * 6; // Random vị trí dọc trong giỏ
            staticGold.style.left = rLeft + '%';
            staticGold.style.bottom = rBottom + '%';
            staticGold.style.transform = `rotate(${Math.random() * 360}deg)`;
            document.querySelector('.game-scene').appendChild(staticGold);

            resetAnimations();
            currentQuestionIndex++;
            renderQuestion();
        }, 1200);

    } else {
        // TRẢ LỜI SAI
        document.getElementById('sfx-wrong').play();
        setTimeout(() => document.getElementById('sfx-cat').play(), 200);

        // Chó rượt, đậu chạy
        spriteCat.classList.remove('hidden');
        spriteCat.classList.add('anim-chase-cat');
        
        spritePea.src = 'assets/Pea_running.png';
        spritePea.classList.add('anim-run-away');

        setTimeout(() => {
            resetAnimations();
            currentQuestionIndex++;
            renderQuestion();
        }, 2500);
    }
}

function resetAnimations() {
    const p = document.getElementById('sprite-pea');
    const d = document.getElementById('sprite-cat');
    const c = document.getElementById('sprite-gold');
    
    p.src = 'assets/pea_idle.png';
    p.classList.remove('anim-jump', 'anim-run-away');
    
    d.classList.remove('anim-chase-cat');
    d.classList.add('hidden');
    
    c.classList.remove('anim-drop-gold');
    c.classList.add('hidden');
}

// Bảng xếp hạng Real-time
let prevScores = {}; // Lưu để tạo hiệu ứng nhảy số
function renderLeaderboard(leaderboardData, listId) {
    const list = document.getElementById(listId);
    list.innerHTML = "";
    
    leaderboardData.forEach((student, index) => {
        const li = document.createElement('li');
        let statusTag = student.online ? "" : " (Offline)";
        li.innerHTML = `<span>#${index+1} ${student.name}${statusTag}</span> <span>${student.score} pts</span>`;
        
        if(!student.online) li.style.opacity = "0.5";

        // Hiệu ứng nhấp nháy xanh nếu điểm tăng
        if(prevScores[student.name] !== undefined && student.score > prevScores[student.name]) {
            li.classList.add('score-up');
        }
        prevScores[student.name] = student.score;

        list.appendChild(li);
    });
}

// ==========================================
// 5. MÀN HÌNH PODIUM (KẾT THÚC)
// ==========================================
function showPodium(leaderboard) {
    document.getElementById('bgm').pause();
    document.getElementById('sfx-laugh').play(); // Âm thanh vui nhộn lúc trao giải
    switchScreen('screen-podium');

    // Cập nhật Top 3
    if(leaderboard[0]) {
        document.getElementById('podium-name-1').innerText = leaderboard[0].name;
        document.getElementById('podium-score-1').innerText = leaderboard[0].score;
    }
    if(leaderboard[1]) {
        document.getElementById('podium-name-2').innerText = leaderboard[1].name;
        document.getElementById('podium-score-2').innerText = leaderboard[1].score;
    }
    if(leaderboard[2]) {
        document.getElementById('podium-name-3').innerText = leaderboard[2].name;
        document.getElementById('podium-score-3').innerText = leaderboard[2].score;
    }

    // Cập nhật Top 4 trở đi
    const list = document.getElementById('final-ranks-list');
    list.innerHTML = "";
    for(let i=3; i<leaderboard.length; i++) {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${i+1} ${leaderboard[i].name}</span> <span>${leaderboard[i].score} pts</span>`;
        list.appendChild(li);
    }
}
