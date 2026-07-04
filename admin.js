/* =========================
   관리자 로그인
========================= */
document.getElementById("btn-admin-login").addEventListener("click", async () => {
    const pw = document.getElementById("admin-pw").value;
    const error = document.getElementById("admin-login-error");
    error.innerText = "";

    const snap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const realPw = snap.val();

    if (!realPw) {
        error.innerText = "관리자 비밀번호가 설정되지 않았습니다.";
        return;
    }
    if (pw !== realPw) {
        error.innerText = "비밀번호가 틀렸습니다.";
        return;
    }

    document.getElementById("admin-login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");

    initAdmin();
});

/* =========================
   관리자 초기화
========================= */
function initAdmin() {
    listenStudents();
    listenSeats();
    listenGame();
}

/* =========================
   게임 상태 제어
========================= */
document.getElementById("btn-start").addEventListener("click", async () => {
    const snap = await db.ref(`${PATH.GAME}/captcha`).once("value");
    if (!snap.val()) {
        alert("인증 단어를 먼저 설정하세요.");
        return;
    }
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.OPEN });
    alert("티켓팅 시작!");
});

document.getElementById("btn-end").addEventListener("click", async () => {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.END });
    alert("티켓팅 종료!");
});

document.getElementById("btn-reset").addEventListener("click", async () => {
    const ok = confirm("전체 초기화하시겠습니까?\n(학생 접속 상태와 좌석 배치가 모두 삭제됩니다)");
    if (!ok) return;

    // 관리자 비밀번호는 유지한 채로 나머지(게임 상태, 학생, 좌석)만 초기화
    const pwSnap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const currentAdminPw = pwSnap.val() || "1234";

    await db.ref("/").set({
        game: {
            state: GAME_STATE.WAIT,
            captcha: DEFAULT_CAPTCHA,
            adminPassword: currentAdminPw
        },
        students: generateStudents(),
        seats: generateSeats()
    });

    alert("초기화 완료! (관리자 비밀번호는 유지됩니다)");
});

/* =========================
   인증 단어 설정
========================= */
document.getElementById("btn-set-captcha").addEventListener("click", async () => {
    const value = document.getElementById("captcha-admin").value.trim();
    if (!value) {
        alert("단어를 입력하세요.");
        return;
    }
    await db.ref(`${PATH.GAME}`).update({ captcha: value });
    document.getElementById("captcha-status").innerText = `현재 단어: ${value}`;
});

/* =========================
   학생 목록 실시간
========================= */
function listenStudents() {
    db.ref(`${PATH.STUDENTS}`).on("value", (snap) => {
        const data = snap.val() || {};
        const list = document.getElementById("student-list");
        list.innerHTML = "";

        let count = 0;
        for (const id in data) {
            count++;
            const div = document.createElement("div");
            div.innerText = `#${id} - ${data[id].status || "OFFLINE"} - ${data[id].seat || "-"}`;
            list.appendChild(div);
        }

        document.getElementById("connect-count").innerText = `${count} / 29`;
    });
}

/* =========================
   좌석 실시간 렌더링 (관리자용 — 클릭 시 잠금 토글)
========================= */
function listenSeats() {
    db.ref(`${PATH.SEATS}`).on("value", (snap) => {
        const seats = snap.val() || {};
        const container = document.getElementById("admin-seat-grid");
        container.innerHTML = "";

        for (const seatId in seats) {
            const seat = seats[seatId];
            const div = document.createElement("div");
            div.className = "seat";

            if (seat.locked) div.classList.add("locked");
            if (seat.owner) {
                div.classList.add("taken");
                div.innerText = seat.owner;
            }

            div.addEventListener("click", async () => {
                await db.ref(`${PATH.SEATS}/${seatId}`).update({
                    locked: !seat.locked
                });
            });

            container.appendChild(div);

            // 학생 화면과 동일한 통로 여백 유지
            const col = parseInt(seatId.split("C")[1], 10);
            if (col === 2 || col === 4) {
                const spacer = document.createElement("div");
                spacer.className = "seat-spacer";
                container.appendChild(spacer);
            }
        }
    });
}

/* =========================
   게임 상태 표시
========================= */
function listenGame() {
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        const game = snap.val();
        if (!game) return;

        let status = "";
        if (game.state === GAME_STATE.WAIT) status = "대기 중";
        if (game.state === GAME_STATE.OPEN) status = "진행 중";
        if (game.state === GAME_STATE.END) status = "종료";

        document.getElementById("captcha-status").innerText = `상태: ${status} / 단어: ${game.captcha}`;
    });
}

/* =========================
   학생 생성 함수 (초기화용)
========================= */
function generateStudents() {
    const students = {};
    for (let i = 1; i <= 29; i++) {
        students[i] = {
            password: String(1000 + i),
            seat: null,
            status: STUDENT_STATE.OFFLINE
        };
    }
    return students;
}
