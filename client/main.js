var socket = io.connect({'forceNew': true});
var socketNickname = null;
var secretPassword = null;
var secretNicknameSet = false;

socket.on("messages", function(data) {
    render(data);
});

socket.on("users", function(users) {
    renderUsers(users);
});

socket.on('nickname-taken', function(nick) {
    alert('El nickname "' + nick + '" ya está en uso. Elige otro.');
});

socket.on('error-message', function(msg) {
    alert(msg);
});

function render(data) {
    var div = document.getElementById("messages");

    var blocks = [];
    (data || []).forEach(function(msg) {
        var last = blocks[blocks.length - 1];
        var ts = msg.ts || msg.id || Date.now();
        if (last && last.nickname === msg.nickname) {
            last.messages.push({ text: msg.text, ts: ts });
        } else {
            blocks.push({ nickname: msg.nickname, messages: [{ text: msg.text, ts: ts }] });
        }
    });

    div.innerHTML = blocks.map(function(block) {
        var color = getColorForNickname(block.nickname);
        var header = '<div class="author" style="color:' + color + ';">' + escapeHtml(block.nickname || 'Sin nombre') + '</div>';
        var texts = block.messages.map(function(m) {
            return '<div class="text">' + escapeHtml(m.text) + '</div>';
        }).join('');
        return '<div class="message"><div class="bubble">' + header + texts + '</div></div>';
    }).join('');

    div.scrollTop = div.scrollHeight;
}

function addMessage() {
    var nicknameInput = document.getElementById("nickname");
    var nickname = socketNickname || nicknameInput.value.trim();
    var text = document.getElementById("text").value;
    if (!text) return;

    if (!socketNickname) {
        if (!nickname) {
            alert('Por favor ingresa un nickname antes de enviar mensajes.');
            return;
        }
        setNickname(nickname, function(res) {
            if (res && res.ok) {
                doSend(nickname, text);
            } else {
                alert(res && res.error ? res.error : 'No se pudo establecer el nickname');
            }
        });
    } else {
        doSend(socketNickname, text);
    }
}

function doSend(nickname, text) {
    document.getElementById("nickname").style.display = "none";
    socket.emit("add-message", { nickname: nickname, text: text });
    document.getElementById("text").value = "";
}

function setNickname(nickname, cb) {
    socket.emit('set-nickname', nickname, function(res) {
        if (res && res.ok) {
            socketNickname = nickname;
            document.getElementById("nickname").style.display = "none";
        }
        if (typeof cb === 'function') cb(res);
    });
}

function getColorForNickname(nick) {
    if (!nick) return '#666';
    var hash = 0;
    for (var i = 0; i < nick.length; i++) {
        hash = nick.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash;
    }
    var c = '#';
    for (var j = 0; j < 3; j++) {
        var value = (hash >> (j * 8)) & 0xFF;
        c += ('00' + (value & 0xFF).toString(16)).substr(-2);
    }
    return c;
}

function renderUsers(users) {
    var container = document.getElementById('users');
    if (!container) return;
    container.innerHTML = (users || []).map(function(u) {
        var color = getColorForNickname(u.nickname);
        return '<div class="user-item"><span class="user-color" style="background:' + color + ';"></span>' + escapeHtml(u.nickname) + '</div>';
    }).join('');
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, function(m) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
    });
}

// Existing key sequence secret handling
var keySequence = "";
var keyTimer = null;

document.addEventListener("keydown", function(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    keySequence += e.key.toLowerCase();
    if (keySequence.length > 6) keySequence = keySequence.slice(-6);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(function() { keySequence = ""; }, 2000);
    if (keySequence.endsWith("secret")) {
        keySequence = "";
        e.preventDefault();
        openSecretModal();
    }
});

function openSecretModal() {
    document.getElementById("secret-overlay").style.display = "flex";
    document.getElementById("secret-password").focus();
}

function closeSecretModal() {
    document.getElementById("secret-overlay").style.display = "none";
    document.getElementById("secret-password").value = "";
    document.getElementById("secret-error").textContent = "";
}

document.getElementById("secret-password").addEventListener("keydown", function(e) {
    if (e.key === "Enter") submitSecretPassword();
    if (e.key === "Escape") closeSecretModal();
});

function submitSecretPassword() {
    var pass = document.getElementById("secret-password").value;
    if (!pass) return;
    secretPassword = pass;
    var hash = CryptoJS.SHA256(pass).toString();
    socket.emit("join-secret", hash);
}

socket.on("secret-joined", function(data) {
    closeSecretModal();
    document.getElementById("secret-chat").style.display = "flex";
    document.querySelector("h1").style.display = "none";
    document.getElementById("messages").style.display = "none";
    document.querySelector("form").style.display = "none";
    renderSecret(data);
});

socket.on("secret-denied", function() {
    document.getElementById("secret-error").textContent = "Contraseña incorrecta.";
    secretPassword = null;
});

socket.on("secret-messages", function(data) {
    renderSecret(data);
});

function renderSecret(data) {
    var div = document.getElementById("secret-messages");
    div.innerHTML = (data || []).map(function(msg) {
        var text = msg.text;
        try {
            var bytes = CryptoJS.AES.decrypt(msg.text, secretPassword);
            text = bytes.toString(CryptoJS.enc.Utf8) || msg.text;
        } catch(e) {}
        return '<div class="message"><strong>' + escapeHtml(msg.nickname) + '</strong><p>' + escapeHtml(text) + '</p></div>';
    }).join('');
    div.scrollTop = div.scrollHeight;
}

function addSecretMessage() {
    var textEl = document.getElementById("secret-text");
    var nicknameEl = document.getElementById("secret-nickname");
    var text = textEl.value;
    if (!text) return;
    if (!secretNicknameSet) {
        if (!nicknameEl.value || !nicknameEl.value.trim()) {
            alert('Por favor ingresa un nickname para el chat secreto.');
            return;
        }
        nicknameEl.style.display = "none";
        secretNicknameSet = true;
    }
    var encrypted = CryptoJS.AES.encrypt(text, secretPassword).toString();
    socket.emit("add-secret-message", { nickname: nicknameEl.value, text: encrypted });
    textEl.value = "";
}

document.getElementById("secret-text").addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        addSecretMessage();
    }
});

function leaveSecretChat() {
    document.getElementById("secret-chat").style.display = "none";
    document.querySelector("h1").style.display = "";
    document.getElementById("messages").style.display = "";
    document.querySelector("form").style.display = "";
    secretPassword = null;
    secretNicknameSet = false;
}

// Enviar con Enter en textarea principal
document.getElementById("text").addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        addMessage();
    }
});
