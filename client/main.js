 var socket = io.connect({'forceNew': true});
  var secretPassword = null;
  var secretNicknameSet = false;

  socket.on("messages", function(data) {
      render(data);
  });

  function render(data) {
      var div = document.getElementById("messages");
      div.innerHTML = data.map(function(msg) {
          return '<div class="message"><strong>' + msg.nickname + '</strong><p>' + msg.text + '</p></div>';
      }).join('');
      div.scrollTop = div.scrollHeight;
  }

  function addMessage() {
      var nickname = document.getElementById("nickname").value;
      var text = document.getElementById("text").value;
      if (!text) return;
      document.getElementById("nickname").style.display = "none";
      socket.emit("add-message", { nickname: nickname, text: text });
      document.getElementById("text").value = "";
  }

  document.getElementById("text").addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          addMessage();
      }
  });

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
      div.innerHTML = data.map(function(msg) {
          var text = msg.text;
          try {
              var bytes = CryptoJS.AES.decrypt(msg.text, secretPassword);
              text = bytes.toString(CryptoJS.enc.Utf8) || msg.text;
          } catch(e) {}
          return '<div class="message"><strong>' + msg.nickname + '</strong><p>' + text + '</p></div>';
      }).join('');
      div.scrollTop = div.scrollHeight;
  }

  function addSecretMessage() {
      var textEl = document.getElementById("secret-text");
      var nicknameEl = document.getElementById("secret-nickname");
      var text = textEl.value;
      if (!text) return;
      if (!secretNicknameSet) {
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
