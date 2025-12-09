/****************************
 FIREBASE INIT
****************************/
const firebaseConfig = {
  apiKey: "AIzaSyAB-n2VgC8cFwS2_0XXbDXohDR1tbJmn1c",
  authDomain: "impostor-game-e2bec.firebaseapp.com",
  projectId: "impostor-game-e2bec",
  storageBucket: "impostor-game-e2bec.firebasestorage.app",
  messagingSenderId: "91990939868",
  appId: "1:91990939868:web:8d7ef85ada985594063c19",
  measurementId: "G-NQ7F2HX43B"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/****************************
 GLOBAL VARS
****************************/
let playerId = crypto.randomUUID();
let playerName = "";
let roomId = "";
let roomRef = null;
let unsubscribe = null;

/****************************
 DOM ELEMENTS
****************************/
const screens = {
    login: document.getElementById("loginScreen"),
    lobby: document.getElementById("lobbyScreen"),
    turn: document.getElementById("turnScreen"),
    roundEnd: document.getElementById("roundEndScreen"),
    voting: document.getElementById("votingScreen"),
    results: document.getElementById("resultsScreen")
};

function show(screen) {
    Object.values(screens).forEach(s => s.classList.add("hidden"));
    screen.classList.remove("hidden");
}

/****************************
 BUTTONS + INPUTS
****************************/
document.getElementById("joinRoomBtn").onclick = joinRoom;
document.getElementById("createRoomBtn").onclick = createRoom;
document.getElementById("submitWordBtn").onclick = submitWord;
document.getElementById("continueBtn").onclick = voteContinue;
document.getElementById("voteNowBtn").onclick = voteNow;
document.getElementById("rematchBtn").onclick = rematch;

/****************************
 LOBBY
****************************/
async function joinRoom() {
    playerName = document.getElementById("playerNameInput").value.trim();
    const code = document.getElementById("roomCodeInput").value.trim();
    const pass = document.getElementById("roomPasswordInput").value.trim();

    if (!playerName || !code || !pass) return;

    const ref = db.collection("rooms").doc(code);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
        document.getElementById("loginError").textContent = "Room not found.";
        return;
    }

    const data = snapshot.data();
    if (data.password !== pass) {
        document.getElementById("loginError").textContent = "Wrong password.";
        return;
    }

    roomId = code;
    roomRef = ref;

    await roomRef.update({
        players: firebase.firestore.FieldValue.arrayUnion({
            id: playerId,
            name: playerName
        })
    });

    attachListener();
    show(screens.lobby);
}

async function createRoom() {
    playerName = document.getElementById("playerNameInput").value.trim();
    const code = document.getElementById("roomCodeInput").value.trim();
    const pass = document.getElementById("roomPasswordInput").value.trim();

    if (!playerName || !code || !pass) return;

    roomId = code;
    roomRef = db.collection("rooms").doc(roomId);

    await roomRef.set({
        password: pass,
        hostId: playerId,
        players: [{ id: playerId, name: playerName }],
        state: "lobby",
        currentTurnIndex: 0,
        currentWord: null,
        roundNumber: 1,
        impostorId: null,
        category: null,
        hint: null
    });

    attachListener();
    show(screens.lobby);
}

/****************************
 LISTENER
****************************/
function attachListener() {
    if (unsubscribe) unsubscribe();

    unsubscribe = roomRef.onSnapshot(snapshot => {
        if (!snapshot.exists) return;
        const room = snapshot.data();

        // LOBBY
        if (room.state === "lobby") return updateLobby(room);

        // TURN
        if (room.state === "turn") return updateTurn(room);

        // ROUND END
        if (room.state === "roundEnd") {
            show(screens.roundEnd);
            return;
        }

        // VOTING
        if (room.state === "voting") {
            updateVoting(room);
            return;
        }

        // RESULTS
        if (room.state === "results") {
            show(screens.results);
            document.getElementById("resultsMessage").textContent = room.resultsMsg;
        }
    });
}

/****************************
 LOBBY DISPLAY
****************************/
function updateLobby(room) {
    show(screens.lobby);

    document.getElementById("lobbyCode").textContent = "Room: " + roomId;
    document.getElementById("lobbyHost").textContent = "Host: " + room.hostId;

    const ul = document.getElementById("playerList");
    ul.innerHTML = "";
    room.players.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name;
        ul.appendChild(li);
    });

    const startBtn = document.getElementById("startGameBtn");
    if (playerId === room.hostId) {
        startBtn.classList.remove("hidden");
        startBtn.onclick = () => startGame(room);
    } else {
        startBtn.classList.add("hidden");
    }
}

/****************************
 START GAME
****************************/
async function startGame(room) {
    const players = room.players;

    const impostor = players[Math.floor(Math.random() * players.length)];

    const categories = [
        { category: "Animals", hint: "A living creature" },
        { category: "Sports", hint: "A competition" },
        { category: "Jobs", hint: "Something a person does" },
        { category: "Fruits", hint: "You can eat it" },
    ];
    const pick = categories[Math.floor(Math.random() * categories.length)];

    await roomRef.update({
        state: "turn",
        category: pick.category,
        hint: pick.hint,
        impostorId: impostor.id,
        currentTurnIndex: 0,
        currentWord: null
    });
}

/****************************
 TURN PHASE
****************************/
function updateTurn(room) {
    show(screens.turn);

    document.getElementById("categoryDisplay").textContent =
        "Category: " + room.category;

    if (playerId === room.impostorId) {
        document.getElementById("hintDisplay").textContent =
            "Hint (only you see this): " + room.hint;
    } else {
        document.getElementById("hintDisplay").textContent = "";
    }

    document.getElementById("turnIndicator").textContent =
        "Current turn: " + room.players[room.currentTurnIndex].name;

    // show revealed word
    if (room.currentWord) {
        const s = document.getElementById("shownWord");
        s.textContent = room.currentWord;
        s.classList.remove("hidden");
    } else {
        document.getElementById("shownWord").classList.add("hidden");
    }

    // input only on your turn
    if (room.players[room.currentTurnIndex].id === playerId) {
        document.getElementById("wordInputSection").classList.remove("hidden");
    } else {
        document.getElementById("wordInputSection").classList.add("hidden");
    }
}

/****************************
 SUBMIT WORD
****************************/
async function submitWord() {
    const room = (await roomRef.get()).data();
    const myIndex = room.players.findIndex(p => p.id === playerId);

    if (myIndex !== room.currentTurnIndex) return;

    const word = document.getElementById("wordInput").value.trim();
    if (!word) return;

    document.getElementById("wordInput").value = "";

    await roomRef.update({
        currentWord: word
    });

    setTimeout(async () => {
        const newData = (await roomRef.get()).data();
        let next = newData.currentTurnIndex + 1;

        if (next >= newData.players.length) {
            roomRef.update({
                state: "roundEnd",
                currentWord: null
            });
        } else {
            roomRef.update({
                currentTurnIndex: next,
                currentWord: null
            });
        }
    }, 3000);
}

/****************************
 ROUND END VOTING
****************************/
async function voteContinue() {
    await roomRef.collection("roundVotes").doc(playerId).set({ vote: "continue" });
}

async function voteNow() {
    await roomRef.collection("roundVotes").doc(playerId).set({ vote: "vote" });
}

roomRef?.collection("roundVotes")?.onSnapshot(async snap => {
    const room = (await roomRef.get()).data();
    if (!room || room.state !== "roundEnd") return;

    const total = room.players.length;
    if (snap.size < total) return;

    const votes = snap.docs.map(d => d.data().vote);

    const continueCount = votes.filter(v => v === "continue").length;
    const voteCount = votes.filter(v => v === "vote").length;

    if (voteCount > continueCount) {
        roomRef.update({ state: "voting" });
    } else {
        // new round
        snap.forEach(d => d.ref.delete());
        roomRef.update({
            state: "turn",
            currentTurnIndex: 0,
            currentWord: null
        });
    }
});

/****************************
 IMPOSTOR VOTING
****************************/
function updateVoting(room) {
    show(screens.voting);

    const ul = document.getElementById("votingList");
    ul.innerHTML = "";

    room.players.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name;
        li.style.cursor = "pointer";
        li.onclick = () => castVote(p.id);
        ul.appendChild(li);
    });
}

async function castVote(targetId) {
    await roomRef.collection("finalVotes").doc(playerId).set({
        vote: targetId
    });

    const snap = await roomRef.collection("finalVotes").get();
    const room = (await roomRef.get()).data();

    if (snap.size < room.players.length) return;

    let votes = {};
    snap.forEach(doc => {
        const v = doc.data().vote;
        votes[v] = (votes[v] || 0) + 1;
    });

    let elim = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];

    let msg =
        elim === room.impostorId
            ? "Crewmates win! Impostor was " + getName(elim, room)
            : "Impostor wins! They survived.";

    roomRef.update({
        state: "results",
        resultsMsg: msg
    });
}

function getName(id, room) {
    return room.players.find(p => p.id === id)?.name || "Unknown";
}

/****************************
 REMATCH
****************************/
async function rematch() {
    const room = (await roomRef.get()).data();
    if (playerId !== room.hostId) return;

    await roomRef.update({
        state: "lobby",
        currentTurnIndex: 0,
        currentWord: null,
        roundNumber: 1,
        impostorId: null,
        category: null,
        hint: null,
    });

    const r1 = await roomRef.collection("roundVotes").get();
    r1.forEach(d => d.ref.delete());

    const r2 = await roomRef.collection("finalVotes").get();
    r2.forEach(d => d.ref.delete());
}
