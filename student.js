/* =========================
   전역 상태
========================= */
let myId = null;
let myData = null;
let currentGame = null;
let selectedSeat = null;

/* =========================
   화면 전환
========================= */
function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
}

/* =========================
   로그인 처리 (통합)
========================= */
document.getElementById("btn-login").addEventListener("click", async () => {
    const id = document.getElementById("student-id").value;
    const pw = document.getElementById("student-pw").value;
    const error = document.getElementById("login-error");
    error.innerText = "";

    if (!id || !pw) {
        error.innerText = "번호와 비밀번호를 입력하세요.";
        return;
    }

    const snap = await db.ref(`${PATH.STUDENTS}/${id}`).once("value");
    const data = snap.val();

    if (!data) {
        error.innerText = "존재하지 않는 번호입니다.";
        return;
    }
    if (data.password !== pw) {
        error.innerText = "비밀번호가 틀렸습니다.";
        return;
    }

    myId = id;
    myData = data;
    localStorage.setItem("myId", myId);

    await db.ref(`${PATH.STUDENTS}/${id}`).update({ status: STUDENT_STATE.ONLINE });
    
    // 리스너 시작
    initListeners();
});

/* =========================
   리스너 통합 (중복 방지)
========================= */
/* =========================
   리스너 통합 (수정됨)
========================= */
function initListeners() {
    // 1. 게임 상태 감시
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        currentGame = snap.val();
        if (!currentGame) return;

        if (currentGame.state === GAME_STATE.WAIT) {
            showView("wait-view");
            document.getElementById("wait-id").innerText = myId;
        } else if (currentGame.state === GAME_STATE.OPEN) {
            if (myData?.seat) {
                showResult(false);
            } else {
                showView("main-view");
            }
        } else if (currentGame.state === GAME_STATE.END) {
            document.getElementById("modal").classList.add("hidden");
            showResult(true); // 여기서 전체 결과 지도 띄움
        }
    });

    // 2. 좌석 실시간 감시 (좌석 이름 R1C1 숨김 처리됨)
    db.ref(`${PATH.SEATS}`).on("value", (snap) => {
        const seats = snap.val() || {};
        const container = document.getElementById("seat-container");
        container.innerHTML = "";

        for (const seatId in seats) {
            const seat = seats[seatId];
            const div = document.createElement("div");
            div.className = "seat";

            if (seat.owner) {
                div.classList.add("taken");
                if (seat.owner === myId) {
                    div.innerText = seat.owner; // 내 자리엔 내 번호 표시
                    div.classList.add("my-seat");
                } else {
                    div.innerText = "●"; // 다른 사람 자리는 점으로 표시
                    div.classList.add("other-taken");
                }
            } else {
                div.innerText = ""; // 빈 자리는 아무 글자도 안 보이게 설정
                div.onclick = () => openModal(seatId);
            }
            container.appendChild(div);
        }
    });

    // 3. 내 데이터 감시
    db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
        myData = snap.val();
        if (myData?.seat) {
            document.getElementById("final-seat").innerText = `내 자리: ${myData.seat}`;
        }
    });
}
/* =========================
   결과 화면
========================= */
/* =========================
   결과 화면 (수정됨)
========================= */
function showResult(final = false) {
    showView("result-view");
    const box = document.getElementById("final-seat");
    
    // 최종 결과 모드일 때
    if (final) {
        document.querySelector("#result-view h2").innerText = "🎉 최종 자리 배치 결과";
        
        // 전체 좌석을 불러와서 표 형태로 표시
        db.ref(`${PATH.SEATS}`).once("value", (snap) => {
            const seats = snap.val() || {};
            let html = `<div style="display:grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-top:10px;">`;
            
            // 좌석 순서대로(R1C1~R5C5) 출력
            for (const seatId in seats) {
                const owner = seats[seatId].owner || "-";
                html += `<div style="border:1px solid #ccc; padding:5px; font-size:11px; text-align:center;">
                          ${seatId}<br><b>${owner}</b>
                        </div>`;
            }
            html += `</div>`;
            box.innerHTML = html;
        });
    } 
    // 그냥 결과창 모드일 때 (내 자리 확인)
    else {
        document.querySelector("#result-view h2").innerText = "자리 배치 결과";
        if (myData?.seat) {
            box.innerHTML = `<h3>내 번호: ${myId}</h3><p>선택 좌석: ${myData.seat}</p>`;
        } else {
            box.innerHTML = `<p>아직 좌석을 선택하지 않았습니다.</p>`;
        }
    }
}
/* =========================
   좌석 클릭 처리
========================= */
function openModal(seatId) {
    selectedSeat = seatId;
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("captcha-input").value = "";
    db.ref(`${PATH.GAME}/captcha`).once("value", (snap) => {
        document.getElementById("captcha-text").innerText = snap.val() || "확인";
    });
}

document.getElementById("btn-cancel").addEventListener("click", () => {
    document.getElementById("modal").classList.add("hidden");
    selectedSeat = null;
});

document.getElementById("btn-confirm").addEventListener("click", async () => {
    const input = document.getElementById("captcha-input").value;
    const snap = await db.ref(`${PATH.GAME}/captcha`).once("value");
    if (input !== snap.val()) {
        alert("인증 단어가 틀렸습니다.");
        return;
    }
    const seatRef = db.ref(`${PATH.SEATS}/${selectedSeat}`);
    const seatSnap = await seatRef.once("value");
    if (seatSnap.val().owner) {
        alert("이미 선택된 자리입니다.");
        return;
    }
    await seatRef.update({ owner: myId });
    await db.ref(`${PATH.STUDENTS}/${myId}`).update({ seat: selectedSeat, status: STUDENT_STATE.DONE });
    document.getElementById("modal").classList.add("hidden");
});

window.addEventListener("load", async () => {
    const savedId = localStorage.getItem("myId");
    if (savedId) {
        myId = savedId;
        const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
        myData = snap.val();
        if (myData) initListeners();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.getElementById("modal").classList.add("hidden");
    }
});