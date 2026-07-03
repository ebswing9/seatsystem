let db = firebase.database();

/* =========================
   상태 변수
========================= */

let myNumber = null;
let myPassword = null;
let selectedSeat = null;

let gameState = "WAIT";

/* =========================
   DOM
========================= */

const loginView = document.getElementById("loginView");
const waitingView = document.getElementById("waitingView");
const ticketView = document.getElementById("ticketView");
const resultView = document.getElementById("resultView");

const loginBtn = document.getElementById("loginBtn");
const adminPageBtn = document.getElementById("adminPageBtn");

const studentNumberInput = document.getElementById("studentNumber");
const studentPasswordInput = document.getElementById("studentPassword");

const seatGrid = document.getElementById("seatGrid");
const resultSeatGrid = document.getElementById("resultSeatGrid");

/* =========================
   로그인
========================= */

loginBtn.onclick = () => {

    const num = studentNumberInput.value;
    const pw = studentPasswordInput.value;

    if (!num || !pw) {
        showMessage("번호와 비밀번호를 입력하세요");
        return;
    }

    db.ref("students/" + num).once("value", snap => {

        const data = snap.val();

        if (!data) {
            showMessage("존재하지 않는 번호입니다");
            return;
        }

        if (data.password !== pw) {
            showMessage("비밀번호가 틀렸습니다");
            return;
        }

        myNumber = num;
        myPassword = pw;

        enterWaiting();

        setupOnlineStatus();

    });

};

/* =========================
   대기 화면
========================= */

function enterWaiting() {

    loginView.classList.add("hidden");
    waitingView.classList.remove("hidden");

    document.getElementById("waitingStudentNumber").innerText = myNumber;

    listenGameState();

}

/* =========================
   게임 상태 감시
========================= */

function listenGameState() {

    db.ref("game/state").on("value", snap => {

        gameState = snap.val();

        if (gameState === "RUN") {
            enterTicket();
        }

        if (gameState === "END") {
            showResult();
        }

    });

}

/* =========================
   티켓 화면
========================= */

function enterTicket() {

    waitingView.classList.add("hidden");
    ticketView.classList.remove("hidden");

    document.getElementById("myNumber").innerText = myNumber;

    createSeats();

    listenSeats();

}
/* =========================
   좌석 생성
========================= */

function createSeats() {

    seatGrid.innerHTML = "";

    const rows = 5;
    const cols = 6;

    for (let r = 1; r <= rows; r++) {

        for (let c = 1; c <= cols; c++) {

            const seatId = `R${r}C${c}`;

            const seat = document.createElement("div");

            seat.classList.add("seat");

            seat.dataset.id = seatId;

            seat.innerText = "";

            seat.onclick = () => selectSeat(seatId);

            seatGrid.appendChild(seat);

        }

    }

}

/* =========================
   좌석 실시간 감시
========================= */

function listenSeats() {

    db.ref("seats").on("value", snap => {

        const seats = snap.val() || {};

        document.querySelectorAll(".seat").forEach(seat => {

            const id = seat.dataset.id;

            const data = seats[id];

            seat.classList.remove("mine", "occupied", "locked");

            if (!data) {
                return;
            }

            if (data.locked) {
                seat.classList.add("locked");
                return;
            }

            if (data.owner === myNumber) {
                seat.classList.add("mine");
            } else {
                seat.classList.add("occupied");
            }

        });

    });

}

/* =========================
   좌석 선택
========================= */

function selectSeat(seatId) {

    db.ref("seats/" + seatId).once("value", snap => {

        const data = snap.val();

        if (data && data.locked) {
            showMessage("선택할 수 없는 자리입니다");
            return;
        }

        selectedSeat = seatId;

        openConfirmModal();

    });

}

/* =========================
   인증 모달 열기
========================= */

function openConfirmModal() {

    const modal = document.getElementById("confirmModal");

    modal.classList.remove("hidden");

    db.ref("game/captcha").once("value", snap => {

        document.getElementById("captchaDisplay").innerText =
            snap.val() || "자리확정";

    });

}

/* =========================
   인증 확정
========================= */

document.getElementById("confirmSeatBtn").onclick = () => {

    const input = document.getElementById("captchaInput").value;

    db.ref("game/captcha").once("value", snap => {

        const correct = snap.val() || "자리확정";

        if (input !== correct) {
            showMessage("인증단어가 틀렸습니다");
            return;
        }

        if (!selectedSeat) return;

        db.ref("seats/" + selectedSeat).transaction(seat => {

            if (seat && seat.owner && seat.owner !== myNumber) {
                return; // 이미 다른 학생이 확정
            }

            return {
                owner: myNumber,
                locked: false
            };

        });

        document.getElementById("confirmModal").classList.add("hidden");

        selectedSeat = null;

    });

};

/* =========================
   취소
========================= */

document.getElementById("cancelSeatBtn").onclick = () => {

    document.getElementById("confirmModal").classList.add("hidden");

    selectedSeat = null;

};

/* =========================
   결과 화면
========================= */

function showResult() {

    ticketView.classList.add("hidden");
    waitingView.classList.add("hidden");
    resultView.classList.remove("hidden");

    db.ref("seats").once("value", snap => {

        const seats = snap.val() || {};

        resultSeatGrid.innerHTML = "";

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
                } else {
                    div.innerText = "";
                }

                resultSeatGrid.appendChild(div);

            }

        }

    });

}

/* =========================
   메시지
========================= */

function showMessage(msg) {

    const el = document.getElementById("loginMessage");

    el.innerText = msg;

    setTimeout(() => {
        el.innerText = "";
    }, 2000);

}