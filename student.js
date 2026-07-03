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

    await db.ref(`${PATH.STUDENTS}/${id}`).update({ 
    status: STUDENT_STATE.ONLINE,
    lastSeen: firebase.database.ServerValue.TIMESTAMP 
});
    
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
                    div.innerText = "마감"; // 다른 사람 자리는 점으로 표시
                    div.classList.add("other-taken");
                }
            } else {
                div.innerText = ""; // 빈 자리는 아무 글자도 안 보이게 설정
                div.onclick = () => openModal(seatId);
            }
            container.appendChild(div);
        }
    });

 // 3. 내 데이터 감시 (더 안전한 버전)
    db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
        myData = snap.val();
        
        // 내 자리가 생겼고, 현재 내가 자리를 고르는 화면(main-view)에 있다면
        if (myData?.seat) {
            const mainView = document.getElementById("main-view");
            // main-view가 화면에 보이고 있는 상태라면 결과창으로 이동
            if (!mainView.classList.contains("hidden")) {
                showResult(false);
            }
        }
    });
/* =========================
   결과 화면
========================= */
/* =========================
   결과 화면 (수정됨)
========================= */
function showResult(final = false) {
    showView("result-view");
    const box = document.getElementById("final-seat");
    
    if (final) {
        document.querySelector("#result-view h2").innerText = "🎉 최종 결과";
        
        // 관리자가 보는 것과 동일하게 데이터 가져오기
        db.ref(`${PATH.SEATS}`).once("value", (snap) => {
            const seats = snap.val() || {};
            // CSS에서 만든 .seat-grid 클래스를 사용하여 똑같은 배치 적용
            let html = `<div class="seat-grid">`; 
            
            for (const seatId in seats) {
                const owner = seats[seatId].owner || "";
                // 좌석 이름(seatId)은 안 보이고, 주인(owner)만 보이게 함
                html += `<div class="seat ${owner ? 'taken' : ''}">
                          ${owner}
                        </div>`;
            }
            html += `</div>`;
            box.innerHTML = html;
        });
    } else {
        // 기존 결과 화면
        document.querySelector("#result-view h2").innerText = "자리 배치 결과";
        box.innerHTML = myData?.seat 
            ? `<h3>내 번호: ${myId}</h3><p>선택 좌석: ${myData.seat}</p>` 
            : `<p>결과를 기다리는 중입니다...</p>`;
    }
}
/* =========================
   좌석 클릭 처리
========================= */
function openModal(seatId) {
    // 1. 이미 자리를 잡았는지 체크
    if (myData && myData.seat) {
        alert("이미 좌석을 선택하셨습니다.");
        return;
    }
    
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
    // 1. 이미 자리를 잡았는지 다시 한번 체크 (중복 선택 방지)
    const currentData = (await db.ref(`${PATH.STUDENTS}/${myId}`).once("value")).val();
    if (currentData && currentData.seat) {
        alert("이미 좌석을 선택하셨습니다.");
        document.getElementById("modal").classList.add("hidden");
        return;
    }

    const input = document.getElementById("captcha-input").value;
    const snap = await db.ref(`${PATH.GAME}/captcha`).once("value");
    
    if (input !== snap.val()) {
        alert("인증 단어가 틀렸습니다.");
        return;
    }

    const seatRef = db.ref(`${PATH.SEATS}/${selectedSeat}`);
    const seatSnap = await seatRef.once("value");
    
    // 2. 다른 학생이 찰나에 그 자리를 채갔는지 체크
    if (seatSnap.val().owner) {
        alert("이미 선택된 자리입니다.");
        document.getElementById("modal").classList.add("hidden");
        return;
    }

    // 3. 이제 확정
    await seatRef.update({ owner: myId });
    await db.ref(`${PATH.STUDENTS}/${myId}`).update({ 
        seat: selectedSeat, 
        status: STUDENT_STATE.DONE 
    });
    
    document.getElementById("modal").classList.add("hidden");
});
window.addEventListener("load", async () => {
    const savedId = localStorage.getItem("myId");
    if (savedId) {
        myId = savedId;
        const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
        myData = snap.val();
        if (myData) {
            // 핵심: 앱이 로드될 때마다 현재 상태를 ONLINE으로 갱신
            await db.ref(`${PATH.STUDENTS}/${myId}`).update({ 
                status: STUDENT_STATE.ONLINE 
            });
            initListeners();
        }
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.getElementById("modal").classList.add("hidden");
    }
});