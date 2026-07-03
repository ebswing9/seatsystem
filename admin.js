console.log("ADMIN JS LOADED");

/* =========================
   상태
========================= */

let gameState = "WAIT";

/* =========================
   DOM
========================= */

const adminLoginView = document.getElementById("adminLoginView");
const adminView = document.getElementById("adminView");

const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginBtn = document.getElementById("adminLoginBtn");

const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const resetBtn = document.getElementById("resetBtn");

const captchaInput = document.getElementById("captchaWord");
const saveCaptchaBtn = document.getElementById("saveCaptchaBtn");

const onlineList = document.getElementById("onlineStudentList");
const onlineCount = document.getElementById("onlineCount");

const seatGrid = document.getElementById("adminSeatGrid");

const studentTableBody = document.getElementById("studentTableBody");

/* =========================
   관리자 로그인
========================= */

adminLoginBtn.onclick = () => {

    const pw = adminPasswordInput.value;

    db.ref("game/adminPassword").once("value", snap => {

        const realPw = snap.val();

        if (!realPw) {
            alert("관리자 비밀번호가 설정되지 않았습니다");
            return;
        }

        if (pw !== realPw) {
            alert("비밀번호가 틀렸습니다");
            return;
        }

        adminLoginView.classList.add("hidden");
        adminView.classList.remove("hidden");

        listenGameState();
        listenSeats();
        listenOnline();

        loadStudents();

    });

};

/* =========================
   게임 상태 감시
========================= */

function listenGameState() {

    db.ref("game/state").on("value", snap => {

        gameState = snap.val();

        document.getElementById("gameStateText").innerText = gameState;

    });

}

/* =========================
   START 게임
========================= */

startBtn.onclick = () => {

    db.ref("game/state").set("RUN");

};

/* =========================
   END 게임
========================= */

endBtn.onclick = () => {

    db.ref("game/state").set("END");

};

/* =========================
   RESET
========================= */

resetBtn.onclick = () => {

    db.ref("game/state").set("WAIT");

    db.ref("seats").remove();

};

/* =========================
   인증단어 저장
========================= */

saveCaptchaBtn.onclick = () => {

    const value = captchaInput.value;

    db.ref("game/captcha").set(value);

    alert("저장 완료");

};

/* =========================
   학생 생성 (1~29)
========================= */

document.getElementById("generateStudentsBtn").onclick = () => {

    for (let i = 1; i <= 29; i++) {

        db.ref("students/" + i).set({
            password: "1234"
        });

    }

    alert("학생 생성 완료");

};

/* =========================
   학생 목록 로드
========================= */

function loadStudents() {

    db.ref("students").on("value", snap => {

        const data = snap.val() || {};

        studentTableBody.innerHTML = "";

        Object.keys(data).forEach(num => {

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${num}</td>
                <td>
                    <input value="${data[num].password || ''}" 
                           onchange="updatePassword('${num}', this.value)">
                </td>
                <td>✔</td>
                <td>
                    <button onclick="deleteStudent('${num}')">삭제</button>
                </td>
            `;

            studentTableBody.appendChild(row);

        });

    });

}

/* =========================
   비밀번호 수정
========================= */

window.updatePassword = (num, pw) => {

    db.ref("students/" + num + "/password").set(pw);

};

/* =========================
   학생 삭제
========================= */

window.deleteStudent = (num) => {

    db.ref("students/" + num).remove();

};

/* =========================
   접속자 확인 (간단 버전)
========================= */

function listenOnline() {

    db.ref("online").on("value", snap => {

        const data = snap.val() || {};

        onlineList.innerHTML = "";

        let count = 0;

        Object.keys(data).forEach(num => {

            count++;

            const div = document.createElement("div");

            div.innerText = `학생 ${num}`;

            onlineList.appendChild(div);

        });

        onlineCount.innerText = count;

    });

}

/* =========================
   좌석 관리자 뷰
========================= */

function listenSeats() {

    db.ref("seats").on("value", snap => {

        const seats = snap.val() || {};

        seatGrid.innerHTML = "";

        const rows = 5;
        const cols = 6;

        for (let r = 1; r <= rows; r++) {

            for (let c = 1; c <= cols; c++) {

                const id = `R${r}C${c}`;

                const div = document.createElement("div");

                div.classList.add("seat");

                const data = seats[id];

                if (data && data.owner) {
                    div.innerText = data.owner;
                }

                seatGrid.appendChild(div);

            }

        }

    });

}
console.log("ADMIN JS END");
