// ==========================================
// 1. FIREBASE INITIALIZATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBqvVlplABXApQ2V1NXqK_jmCXTPmuQr1c",
    authDomain: "thantai-322a9.firebaseapp.com",
    databaseURL: "https://thantai-322a9-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "thantai-322a9",
    storageBucket: "thantai-322a9.firebasestorage.app",
    messagingSenderId: "843639760178",
    appId: "1:843639760178:web:dc6a5ebe715e9d9745e32b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. KHỞI TẠO BIẾN
// ==========================================
let isTeacher = false;
let myName = "";
let roomCode = "";
let myPlayerId = null;
let roomRef = null;

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
// 3. LUỒNG GIÁO VIÊN (HOST)
// ==========================================
document.getElementById('btn-create-room').addEventListener('click', () => {
    isTeacher = true;
    switchScreen('screen-teacher-lobby');

    // Sinh mã ngẫu nhiên 6 ký tự
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    roomCode = "";
    for (let i = 0; i < 6; i++) roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('display-room-code').innerText = "ĐANG TẠO PHÒNG...";

    // Tạo phòng trên Firebase
    roomRef = db.ref('rooms/' + roomCode);
    roomRef.set({
        status: 'lobby',
        createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        document.getElementById('display-room-code').innerText = roomCode;
        console.log("✅ Phòng đã tạo: " + roomCode);

        // Lắng nghe học sinh vào phòng (real-time)
        roomRef.child('players').on('value', (snapshot) => {
            const players = snapshot.val() || {};
            updateTeacherLobbyUI(players);

            // Bật nút Bắt đầu nếu có ít nhất 1 HS
            if (Object.keys(players).length > 0) {
                document.getElementById('btn-start-game').disabled = false;
            }
        });
    }).catch((err) => {
        document.getElementById('display-room-code').innerText = "LỖI!";
        alert("Không thể tạo phòng: " + err.message);
    });

    // Tự xóa phòng khi GV đóng trình duyệt
    roomRef.onDisconnect().remove();
});

function updateTeacherLobbyUI(players) {
    const list = document.getElementById('teacher-student-list');
    list.innerHTML = "";
    let count = 0;
    Object.values(players).forEach(p => {
        count++;
        const li = document.createElement('li');
        li.innerText = "👦 " + p.name;
        list.appendChild(li);
    });
    document.getElementById('teacher-student-count').innerText = count;
}

// GV bấm Bắt đầu chơi
document.getElementById('btn-start-game').addEventListener('click', () => {
    switchScreen('screen-game');
    document.getElementById('btn-end-game').classList.remove('hidden');
    document.getElementById('bgm').play();

    // Đổi trạng thái phòng → tất cả HS sẽ nhận được
    roomRef.child('status').set('playing');

    // Lắng nghe điểm số real-time để hiện bảng xếp hạng
    roomRef.child('players').on('value', (snapshot) => {
        const players = snapshot.val() || {};
        const sorted = Object.values(players)
            .sort((a, b) => b.score - a.score);
        renderLeaderboard(sorted, 'live-leaderboard-list');
    });
});

// GV bấm Kết thúc
document.getElementById('btn-end-game').addEventListener('click', () => {
    roomRef.child('status').set('ended');

    roomRef.child('players').once('value', (snapshot) => {
        const players = snapshot.val() || {};
        const sorted = Object.values(players)
            .sort((a, b) => b.score - a.score);
        showPodium(sorted);
    });
});

// GV đóng trình duyệt đột ngột
window.addEventListener('beforeunload', () => {
    if (isTeacher && roomRef) {
        roomRef.remove();
    }
});

// ==========================================
// 4. LUỒNG HỌC SINH (CLIENT)
// ==========================================
document.getElementById('btn-join-room-ui').addEventListener('click', () => {
    switchScreen('screen-student-join');
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    const name = document.getElementById('input-student-name').value.trim();
    const errorMsg = document.getElementById('join-error-msg');

    if (code.length !== 6 || name === "") {
        errorMsg.innerText = "Vui lòng nhập đủ mã phòng (6 ký tự) và tên!";
        return;
    }

    errorMsg.innerText = "Đang kết nối...";

    // Kiểm tra phòng có tồn tại không
    roomRef = db.ref('rooms/' + code);
    roomRef.child('status').once('value', (snapshot) => {
        const status = snapshot.val();
        if (!status) {
            errorMsg.innerText = "Không tìm thấy phòng! Kiểm tra lại mã.";
            return;
        }
        if (status === 'ended') {
            errorMsg.innerText = "Phòng này đã kết thúc!";
            return;
        }

        roomCode = code;

        // Xử lý trùng tên
        roomRef.child('players').once('value', (playersSnap) => {
            const players = playersSnap.val() || {};
            const existingNames = Object.values(players).map(p => p.name);
            let finalName = name;
            let suffix = 2;
            while (existingNames.includes(finalName)) {
                finalName = name + " " + suffix;
                suffix++;
            }
            myName = finalName;

            // Thêm học sinh vào phòng
            const newPlayerRef = roomRef.child('players').push();
            myPlayerId = newPlayerRef.key;
            newPlayerRef.set({
                name: myName,
                score: 0
            }).then(() => {
                // Xóa player khi HS thoát
                newPlayerRef.onDisconnect().remove();

                // Chuyển sang màn chờ
                switchScreen('screen-student-waiting');

                // Cập nhật danh sách phòng chờ real-time
                roomRef.child('players').on('value', (snap) => {
                    const allPlayers = snap.val() || {};
                    const waitList = document.getElementById('student-waiting-list');
                    waitList.innerHTML = "";
                    Object.values(allPlayers).forEach(p => {
                        const li = document.createElement('li');
                        li.innerText = "⭐ " + p.name;
                        waitList.appendChild(li);
                    });
                });

                // Lắng nghe GV bắt đầu / kết thúc game
                roomRef.child('status').on('value', (snap) => {
                    const newStatus = snap.val();
                    if (newStatus === 'playing') {
                        startStudentGame();
                    } else if (newStatus === 'ended') {
                        roomRef.child('players').once('value', (pSnap) => {
                            const ps = pSnap.val() || {};
                            const sorted = Object.values(ps).sort((a, b) => b.score - a.score);
                            showPodium(sorted);
                        });
                    } else if (!newStatus) {
                        // Phòng bị xóa (GV thoát)
                        alert("Giáo viên đã đóng phòng!");
                        window.location.reload();
                    }
                });

            }).catch((err) => {
                errorMsg.innerText = "Lỗi kết nối: " + err.message;
            });
        });
    });
});

// ==========================================
// 5. GAMEPLAY LOGIC & ANIMATIONS
// ==========================================
let currentQuestionIndex = 0;

function startStudentGame() {
    switchScreen('screen-game');
    document.getElementById('student-quiz-ui').classList.remove('hidden');
    document.getElementById('bgm').play();
    currentQuestionIndex = 0;
    renderQuestion();

    // Lắng nghe bảng xếp hạng real-time
    roomRef.child('players').on('value', (snapshot) => {
        const players = snapshot.val() || {};
        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        renderLeaderboard(sorted, 'live-leaderboard-list');
    });
}

function renderQuestion() {
    if (currentQuestionIndex >= questions.length) {
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

    if (selectedIndex === correctIndex) {
        // TRẢ LỜI ĐÚNG
        document.getElementById('sfx-correct').play();
        setTimeout(() => document.getElementById('sfx-drop').play(), 100);
        setTimeout(() => document.getElementById('sfx-jump').play(), 500);

        // Phát vàng ngẫu nhiên
        spriteGold.src = Math.random() > 0.5 ? 'assets/Gold_1.png' : 'assets/Gold_2.png';
        spriteGold.classList.remove('hidden');
        spriteGold.classList.add('anim-drop-gold');

        // Hạt đậu nhảy
        spritePea.src = 'assets/pea_jump.png';
        spritePea.classList.add('anim-jump');

        // Cập nhật điểm lên Firebase (cộng 10 điểm)
        if (myPlayerId && roomRef) {
            roomRef.child('players/' + myPlayerId + '/score')
                .transaction(currentScore => (currentScore || 0) + 10);
        }

        setTimeout(() => {
            // Thêm vàng vĩnh viễn vào giỏ
            const staticGold = document.createElement('img');
            staticGold.src = spriteGold.src;
            staticGold.className = 'accumulated-gold';
            const rLeft = 38 + Math.random() * 8;
            const rBottom = -5 + Math.random() * 6;
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

        // Mèo rượt, đậu chạy
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

// ==========================================
// 6. BẢNG XẾP HẠNG REAL-TIME
// ==========================================
let prevScores = {};
function renderLeaderboard(leaderboardData, listId) {
    const list = document.getElementById(listId);
    list.innerHTML = "";

    leaderboardData.forEach((student, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${index + 1} ${student.name}</span> <span>${student.score} pts</span>`;

        // Hiệu ứng nhấp nháy xanh nếu điểm tăng
        if (prevScores[student.name] !== undefined && student.score > prevScores[student.name]) {
            li.classList.add('score-up');
        }
        prevScores[student.name] = student.score;

        list.appendChild(li);
    });
}

// ==========================================
// 7. MÀN HÌNH PODIUM (KẾT THÚC)
// ==========================================
function showPodium(leaderboard) {
    document.getElementById('bgm').pause();
    document.getElementById('sfx-laugh').play();
    switchScreen('screen-podium');

    // Cập nhật Top 3
    if (leaderboard[0]) {
        document.getElementById('podium-name-1').innerText = leaderboard[0].name;
        document.getElementById('podium-score-1').innerText = leaderboard[0].score;
    }
    if (leaderboard[1]) {
        document.getElementById('podium-name-2').innerText = leaderboard[1].name;
        document.getElementById('podium-score-2').innerText = leaderboard[1].score;
    }
    if (leaderboard[2]) {
        document.getElementById('podium-name-3').innerText = leaderboard[2].name;
        document.getElementById('podium-score-3').innerText = leaderboard[2].score;
    }

    // Cập nhật Top 4 trở đi
    const list = document.getElementById('final-ranks-list');
    list.innerHTML = "";
    for (let i = 3; i < leaderboard.length; i++) {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${i + 1} ${leaderboard[i].name}</span> <span>${leaderboard[i].score} pts</span>`;
        list.appendChild(li);
    }
}
