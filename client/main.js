  var socket = io.connect({'forceNew': true});
  var socketNickname = null;
  var secretPassword = null;
  var secretNicknameSet = false;
  var replyingTo = null;
  var allReactions = {};
  var messagesById = {};
  var gifCache = [];
  var panelOpen = false;
  var isTyping = false;
  var typingTimer = null;
  var gifSearchTimer = null;
  var reactionPickerTarget = null;

  var QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

  // === Socket events ===

  socket.on("messages", function(data) {
      messagesById = {};
      (data || []).forEach(function(m) { if (m.id) messagesById[m.id] = m; });
      render(data);
  });

  socket.on("reactions", function(data) {
      allReactions = data || {};
      updateAllReactions();
  });

  socket.on("reaction-update", function(data) {
      if (!data) return;
      allReactions[data.messageId] = data.reactions || {};
      var el = document.querySelector('.msg-item[data-id="' + data.messageId + '"] .reactions');
      if (el) el.innerHTML = renderReactionsHtml(data.messageId);
  });

  socket.on("typing-update", function(users) {
      var div = document.getElementById("typing-indicator");
      if (!users || users.length === 0) { div.textContent = ''; return; }
      if (users.length === 1) div.textContent = users[0] + ' está escribiendo...';
      else if (users.length === 2) div.textContent = users[0] + ' y ' + users[1] + ' están escribiendo...';
      else div.textContent = 'Varios usuarios están escribiendo...';
  });

  socket.on("users", function(users) { renderUsers(users); });
  socket.on('nickname-taken', function(nick) { alert('El nickname "' + nick + '" ya está en uso. Elige otro.'); });
  socket.on('error-message', function(msg) { alert(msg); });

  // === Render ===

  function render(data) {
      var div = document.getElementById("messages");
      var wasAtBottom = div.scrollTop + div.clientHeight >= div.scrollHeight - 10;

      var blocks = [];
      (data || []).forEach(function(msg) {
          var last = blocks[blocks.length - 1];
          if (last && last.nickname === msg.nickname && !msg.replyTo) {
              last.messages.push(msg);
          } else {
              blocks.push({ nickname: msg.nickname, messages: [msg] });
          }
      });

      div.innerHTML = blocks.map(function(block) {
          var color = getColorForNickname(block.nickname);
          var header = '<div class="author" style="color:' + color + ';">' + escapeHtml(block.nickname || 'Sin nombre')
  + '</div>';
          var texts = block.messages.map(function(m) {
              var replyHtml = '';
              if (m.replyTo) {
                  var qt = m.replyTo.type === 'gif' ? '[GIF]' : (m.replyTo.text || '').substring(0, 60) +
  ((m.replyTo.text || '').length > 60 ? '...' : '');
                  replyHtml = '<div class="reply-quote"><strong>' + escapeHtml(m.replyTo.nickname) + '</strong>: ' +
  escapeHtml(qt) + '</div>';
              }
              var content = m.type === 'gif'
                  ? '<img class="chat-gif" src="' + escapeHtml(m.text) + '" alt="GIF" loading="lazy" />'
                  : '<div class="text">' + escapeHtml(m.text) + '</div>';
              return '<div class="msg-item" data-id="' + m.id + '">' +
                  replyHtml + content +
                  '<div class="reactions">' + renderReactionsHtml(m.id) + '</div>' +
                  '<div class="msg-actions">' +
                      '<button class="action-btn" onclick="setReplyById(' + m.id + ')">↩ Responder</button>' +
                      '<button class="action-btn react-btn" onclick="toggleReactionPicker(this,' + m.id +
  ')">+😊</button>' +
                  '</div>' +
              '</div>';
          }).join('');
          return '<div class="message"><div class="bubble">' + header + texts + '</div></div>';
      }).join('');

      if (wasAtBottom) div.scrollTop = div.scrollHeight;
  }

  function renderReactionsHtml(messageId) {
      var r = allReactions[messageId] || {};
      return Object.keys(r).map(function(emoji) {
          var users = r[emoji] || [];
          if (users.length === 0) return '';
          var isMe = socketNickname && users.indexOf(socketNickname) !== -1;
          return '<button class="reaction' + (isMe ? ' reaction-mine' : '') + '" onclick="addReaction(' + messageId +
  ',this)" data-emoji="' + escapeHtml(emoji) + '" title="' + escapeHtml(users.join(', ')) + '">' + emoji + ' ' +
  users.length + '</button>';
      }).join('');
  }

  function updateAllReactions() {
      document.querySelectorAll('.msg-item[data-id]').forEach(function(el) {
          var id = parseInt(el.getAttribute('data-id'));
          var reactDiv = el.querySelector('.reactions');
          if (reactDiv) reactDiv.innerHTML = renderReactionsHtml(id);
      });
  }

  // === Reply ===

  function setReplyById(messageId) {
      var msg = messagesById[messageId];
      if (!msg) return;
      replyingTo = { id: msg.id, nickname: msg.nickname, text: msg.text || '', type: msg.type || 'text' };
      var displayText = msg.type === 'gif' ? '[GIF]' : (msg.text || '').substring(0, 60);
      document.getElementById("reply-preview-text").textContent = msg.nickname + ': ' + displayText;
      document.getElementById("reply-preview").style.display = 'flex';
      document.getElementById("text").focus();
  }

  function cancelReply() {
      replyingTo = null;
      document.getElementById("reply-preview").style.display = 'none';
  }

  // === Reactions ===

  function addReaction(messageId, btnOrEmoji) {
      if (!socketNickname) { alert('Pon un nickname primero.'); return; }
      var emoji = typeof btnOrEmoji === 'string' ? btnOrEmoji : btnOrEmoji.getAttribute('data-emoji');
      socket.emit("add-reaction", { messageId: messageId, emoji: emoji, nickname: socketNickname });
  }

  function toggleReactionPicker(btn, messageId) {
      var existing = document.getElementById('reaction-picker');
      if (existing && reactionPickerTarget === messageId) {
          existing.remove();
          reactionPickerTarget = null;
          return;
      }
      if (existing) existing.remove();
      reactionPickerTarget = messageId;
      var picker = document.createElement('div');
      picker.id = 'reaction-picker';
      picker.innerHTML = QUICK_EMOJIS.map(function(e) {
    return '<button data-emoji="' + e + '" onclick="addReaction(' + messageId + ', this); closeReactionPicker();">' + e + '</button>';
      closeReactionPicker();">' + e + '</button>';
      }).join('');
      var rect = btn.getBoundingClientRect();
      picker.style.top = (rect.top - 55 + window.scrollY) + 'px';
      picker.style.left = rect.left + 'px';
      document.body.appendChild(picker);
  }

  function closeReactionPicker() {
      var p = document.getElementById('reaction-picker');
      if (p) p.remove();
      reactionPickerTarget = null;
  }

  // === Emoji / GIF panel ===

  function togglePanel() {
      panelOpen = !panelOpen;
      document.getElementById("media-panel").style.display = panelOpen ? 'block' : 'none';
  }

  function switchTab(tab) {
      document.getElementById('tab-emojis').style.display = tab === 'emojis' ? 'block' : 'none';
      document.getElementById('tab-gifs').style.display = tab === 'gifs' ? 'block' : 'none';
      document.querySelectorAll('.panel-tab').forEach(function(b) {
          b.classList.toggle('active', (tab === 'emojis' && b.textContent.includes('Emoji')) || (tab === 'gifs' &&
  b.textContent.includes('GIF')));
      });
  }

  document.addEventListener('emoji-click', function(e) {
      var emoji = e.detail && e.detail.unicode;
      if (!emoji) return;
      var el = document.getElementById("text");
      var pos = el.selectionStart;
      el.value = el.value.substring(0, pos) + emoji + el.value.substring(pos);
      el.selectionStart = el.selectionEnd = pos + emoji.length;
      el.focus();
  });

  function searchGifs(q) {
      clearTimeout(gifSearchTimer);
      var results = document.getElementById('gif-results');
      if (!q) { results.innerHTML = ''; gifCache = []; return; }
      gifSearchTimer = setTimeout(function() {
          fetch('/api/gifs?q=' + encodeURIComponent(q))
              .then(function(r) { return r.json(); })
              .then(function(data) {
                  if (!data.data || data.data.length === 0) {
                      results.innerHTML = '<p style="color:#999;font-size:.85rem">No se encontraron GIFs.</p>';
                      return;
                  }
                  gifCache = [];
                  results.innerHTML = data.data.map(function(gif, i) {
                      var thumb = gif.images && gif.images.fixed_height_small && gif.images.fixed_height_small.url;
                      var original = gif.images && gif.images.original && gif.images.original.url;
                      if (!thumb || !original) return '';
                      gifCache[i] = original;
                      return '<img class="gif-thumb" src="' + escapeHtml(thumb) + '" onclick="sendGif(' + i + ')" />';
                  }).join('');
              })
              .catch(function() {});
      }, 400);
  }

  function sendGif(idx) {
      var url = gifCache[idx];
      if (!url) return;
      var nickname = socketNickname || document.getElementById("nickname").value.trim();
      if (!nickname) { alert('Pon un nickname primero.'); return; }
      var doIt = function(nick) {
          socket.emit("add-message", { nickname: nick, text: url, type: 'gif', replyTo: replyingTo });
          cancelReply();
          togglePanel();
      };
      if (!socketNickname) {
          setNickname(nickname, function(res) {
              if (res && res.ok) doIt(nickname);
              else alert(res && res.error ? res.error : 'No se pudo establecer el nickname');
          });
      } else {
          doIt(socketNickname);
      }
  }

  // === Main message ===

  function addMessage() {
      var nickname = socketNickname || document.getElementById("nickname").value.trim();
      var text = document.getElementById("text").value;
      if (!text) return;
      if (!socketNickname) {
          if (!nickname) { alert('Por favor ingresa un nickname antes de enviar mensajes.'); return; }
          setNickname(nickname, function(res) {
              if (res && res.ok) doSend(nickname, text);
              else alert(res && res.error ? res.error : 'No se pudo establecer el nickname');
          });
      } else {
          doSend(socketNickname, text);
      }
  }

  function doSend(nickname, text) {
      document.getElementById("nickname").style.display = "none";
      socket.emit("add-message", { nickname: nickname, text: text, replyTo: replyingTo });
      document.getElementById("text").value = "";
      cancelReply();
      if (isTyping) { socket.emit("stop-typing"); isTyping = false; }
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

  // === Typing indicator ===

  document.getElementById("text").addEventListener("input", function() {
      if (!socketNickname) return;
      if (!isTyping) { isTyping = true; socket.emit("typing", socketNickname); }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(function() { isTyping = false; socket.emit("stop-typing"); }, 2000);
  });

  // === Click outside to close panel/picker ===

  document.addEventListener('click', function(e) {
      if (!e.target.closest('#media-panel') && !e.target.closest('#media-btn') && panelOpen) {
          panelOpen = false;
          document.getElementById("media-panel").style.display = 'none';
      }
      if (!e.target.closest('.react-btn') && !e.target.closest('#reaction-picker')) {
          closeReactionPicker();
      }
  });

  // === Helpers ===

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
          return '<div class="user-item"><span class="user-color" style="background:' + color + ';"></span>' +
  escapeHtml(u.nickname) + '</div>';
      }).join('');
  }

  function escapeHtml(s) {
      if (!s) return '';
      return String(s).replace(/[&<>"']/g, function(m) {
          return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
      });
  }

  // === Key sequence (secret) ===

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
      socket.emit("join-secret", pass);
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

  socket.on("secret-messages", function(data) { renderSecret(data); });

  function renderSecret(data) {
      var div = document.getElementById("secret-messages");
      div.innerHTML = (data || []).map(function(msg) {
          var text = msg.text;
          try {
              var bytes = CryptoJS.AES.decrypt(msg.text, secretPassword);
              text = bytes.toString(CryptoJS.enc.Utf8) || msg.text;
          } catch(e) {}
          return '<div class="message"><strong>' + escapeHtml(msg.nickname) + '</strong><p>' + escapeHtml(text) +
  '</p></div>';
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
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addSecretMessage(); }
  });

  function leaveSecretChat() {
      document.getElementById("secret-chat").style.display = "none";
      document.querySelector("h1").style.display = "";
      document.getElementById("messages").style.display = "";
      document.querySelector("form").style.display = "";
      secretPassword = null;
      secretNicknameSet = false;
  }

  document.getElementById("text").addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMessage(); }
  });
