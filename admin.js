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

    localStorage.setItem("isAdmin", "true");

    document.getElementById("admin-login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");

    initAdmin();
});

/* =========================
   관리자 로그아웃
========================= */
function adminLogout() {
    localStorage.removeItem("isAdmin");
    document.getElementById("admin-view").classList.add("hidden");
    document.getElementById("admin-login-view").classList.remove("hidden");
    document.getElementById("admin-pw").value = "";
}

document.getElementById("btn-admin-logout")?.addEventListener("click", adminLogout);

/* =========================
   자동 로그인 (새로고침 대응)
========================= */
window.addEventListener("load", () => {
    if (localStorage.getItem("isAdmin") === "true") {
        document.getElementById("admin-login-view").classList.add("hidden");
        document.getElementById("admin-view").classList.remove("hidden");
        initAdmin();
    }
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
   학생 비밀번호 CSV 다운로드
========================= */
document.getElementById("btn-download-csv").addEventListener("click", async () => {
    const snap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const data = snap.val() || {};

    const rows = Object.keys(data)
        .map(id => parseInt(id, 10))
        .sort((a, b) => a - b)
        .map(id => `${id},${data[id].password}`);

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "student_passwords.csv";
    a.click();
    URL.revokeObjectURL(url);
});

/* =========================
   학생 비밀번호 CSV 업로드/적용
   - 좌석, 접속 상태는 그대로 두고 비밀번호만 갱신
========================= */
document.getElementById("btn-apply-csv").addEventListener("click", () => {
    const fileInput = document.getElementById("csv-upload");
    const status = document.getElementById("csv-status");
    status.innerText = "";

    const file = fileInput.files[0];
    if (!file) {
        status.innerText = "CSV 파일을 선택하세요.";
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0);

        const updates = {};
        const errors = [];
        let successCount = 0;

        lines.forEach((line, idx) => {
            const parts = line.split(",").map(p => p.trim());
            if (parts.length !== 2) {
                errors.push(`${idx + 1}행 형식 오류`);
                return;
            }

            const [idStr, pw] = parts;
            const id = parseInt(idStr, 10);

            if (isNaN(id) || id < 1 || id > 29) {
                errors.push(`${idx + 1}행 번호 오류(${idStr})`);
                return;
            }
            if (!pw) {
                errors.push(`${idx + 1}행 비밀번호 없음`);
                return;
            }

            updates[`${PATH.STUDENTS}/${id}/password`] = pw;
            successCount++;
        });

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        let message = `✅ ${successCount}명 비밀번호 적용 완료`;
        if (errors.length > 0) {
            message += ` / ⚠️ 오류 ${errors.length}건: ${errors.join(", ")}`;
        }
        status.innerText = message;
        fileInput.value = "";
    };

    reader.readAsText(file);
});

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
    alert("티켓팅 시작");
});

document.getElementById("btn-end").addEventListener("click", async () => {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.END });
    alert("티켓팅 종료");
});

document.getElementById("btn-reset").addEventListener("click", async () => {
    const ok = confirm("전체 초기화하시겠습니까?\n(좌석 배치와 접속 상태가 모두 삭제됩니다)");
    if (!ok) return;

    // 관리자 비밀번호는 유지
    const pwSnap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const currentAdminPw = pwSnap.val() || "1234";

    // 학생 비밀번호도 유지 (CSV로 설정해둔 값이 초기화되지 않도록)
    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const existingStudents = studentsSnap.val() || {};

    const newStudents = generateStudents();
    for (const id in newStudents) {
        if (existingStudents[id] && existingStudents[id].password) {
            newStudents[id].password = existingStudents[id].password;
        }
    }

    await db.ref("/").set({
        game: {
            state: GAME_STATE.WAIT,
            captcha: DEFAULT_CAPTCHA,
            adminPassword: currentAdminPw
        },
        students: newStudents,
        seats: generateSeats()
    });

    alert("초기화 완료  (관리자 비밀번호와 학생 비밀번호는 유지됩니다)");
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
            const status = data[id].status || "OFFLINE";
            if (status === STUDENT_STATE.ONLINE || status === STUDENT_STATE.DONE) {
                count++;
            }

            const row = document.createElement("div");
            row.className = "student-row";

            const idSpan = document.createElement("span");
            idSpan.innerText = `#${id}`;

            const statusSpan = document.createElement("span");
            statusSpan.className = `status-badge status-${status.toLowerCase()}`;
            statusSpan.innerText = status;

            const seatSpan = document.createElement("span");
            seatSpan.className = "student-seat";
            seatSpan.innerText = data[id].seat || "-";

            row.appendChild(idSpan);
            row.appendChild(statusSpan);
            row.appendChild(seatSpan);
            list.appendChild(row);
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
