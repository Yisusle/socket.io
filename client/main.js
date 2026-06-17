  var socket = io.connect({'forceNew': true});
  var socketNickname = null;
  var secretPassword = null;
  var secretNicknameSet = false;
  var replyingTo = null;
  var secretReplyingTo = null;
  var allReactions = {};
  var allSecretReactions = {};
  var messagesById = {};
  var secretMessagesById = {};
  var gifCache = [];
  var panelOpen = false;
  var isTyping = false;
  var typingTimer = null;
  var gifSearchTimer = null;
  var reactionPickerTarget = null;
  var secretReactionPickerTarget = null;
  var isSecretMode = false;

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

  socket.on("secret-reactions", function(data) {
      allSecretReactions = data || {};
  });

  socket.on("secret-reaction-update", function(data) {
      if (!data) return;
      allSecretReactions[data.messageId] = data.reactions || {};
      var el = document.querySelector('.secret-msg-item[data-id="' + data.messageId + '"] .reactions');
      if (el) el.innerHTML = renderSecretReactionsHtml(data.messageId);
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

  // === Render público ===

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
          var header = '<div class="author" style="color:' + color + ';">' + escapeHtml(block.nickname || 'Sin nombre') + '</div>';
          var texts = block.messages.map(function(m) {
              var replyHtml = '';
              if (m.replyTo) {
                  var qt = m.replyTo.type === 'gif' ? '[GIF]' : (m.replyTo.text || '').substring(0, 60) + ((m.replyTo.text || '').length > 60 ? '...' : '');
                  replyHtml = '<div class="reply-quote"><strong>' + escapeHtml(m.replyTo.nickname) + '</strong>: ' + escapeHtml(qt) + '</div>';
              }
              var content = m.type === 'gif'
                  ? '<img class="chat-gif" src="' + escapeHtml(m.text) + '" alt="GIF" loading="lazy" />'
                  : '<div class="text">' + escapeHtml(m.text) + '</div>';
              return '<div class="msg-item" data-id="' + m.id + '">' +
                  replyHtml + content +
                  '<div class="reactions">' + renderReactionsHtml(m.id) + '</div>' +
                  '<div class="msg-actions">' +
                      '<button class="action-btn" onclick="setReplyById(' + m.id + ')">↩ Responder</button>' +
                      '<button class="action-btn react-btn" onclick="toggleReactionPicker(this,' + m.id + ')">+😊</button>' +
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
          return '<button class="reaction' + (isMe ? ' reaction-mine' : '') + '" onclick="addReaction(' + messageId + ',this)" data-emoji="' + escapeHtml(emoji) + '" title="' + escapeHtml(users.join(', ')) +
  '">' + emoji + ' ' + users.length + '</button>';
      }).join('');
  }

  function updateAllReactions() {
      document.querySelectorAll('.msg-item[data-id]').forEach(function(el) {
          var id = parseInt(el.getAttribute('data-id'));
          var reactDiv = el.querySelector('.reactions');
          if (reactDiv) reactDiv.innerHTML = renderReactionsHtml(id);
      });
  }

  // === Reply público ===

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

  // === Reacciones público ===

  function addReaction(messageId, btnOrEmoji) {
      if (!socketNickname) { alert('Pon un nickname primero.'); return; }
      var emoji = typeof btnOrEmoji === 'string' ? btnOrEmoji : btnOrEmoji.getAttribute('data-emoji');
      socket.emit("add-reaction", { messageId: messageId, emoji: emoji, nickname: socketNickname });
  }

  function toggleReactionPicker(btn, messageId) {
      var existing = document.getElementById('reaction-picker');
      if (existing && reactionPickerTarget === messageId) {
          existing.remove(); reactionPickerTarget = null; return;
      }
      if (existing) existing.remove();
      reactionPickerTarget = messageId;
      var picker = document.createElement('div');
      picker.id = 'reaction-picker';
      picker.innerHTML = QUICK_EMOJIS.map(function(e) {
          return '<button data-emoji="' + e + '" onclick="addReaction(' + messageId + ', this); closeReactionPicker();">' + e + '</button>';
      }).join('');
      var rect = btn.getBoundingClientRect();
      picker.style.top = (rect.top - 55 + window.scrollY) + 'px';
      picker.style.left = rect.left + 'px';
      document.body.appendChild(picker);
  }

  // === Render secreto ===

  function renderSecret(data) {
      secretMessagesById = {};
      (data || []).forEach(function(m) { if (m.id) secretMessagesById[m.id] = m; });
      var div = document.getElementById("secret-messages");
      var wasAtBottom = div.scrollTop + div.clientHeight >= div.scrollHeight - 10;
      div.innerHTML = (data || []).map(function(msg) {
          var text = msg.text;
          var type = msg.type || 'text';
          try {
              var bytes = CryptoJS.AES.decrypt(msg.text, secretPassword);
              var dec = bytes.toString(CryptoJS.enc.Utf8);
              if (dec) text = dec;
          } catch(e) {}
          var replyHtml = '';
          if (msg.replyTo) {
              var qt = msg.replyTo.type === 'gif' ? '[GIF]' : '';
              if (!qt) {
                  try {
                      var rb = CryptoJS.AES.decrypt(msg.replyTo.encryptedText, secretPassword);
                      qt = (rb.toString(CryptoJS.enc.Utf8) || '').substring(0, 60);
                  } catch(e) { qt = '...'; }
              }
              replyHtml = '<div class="reply-quote"><strong>' + escapeHtml(msg.replyTo.nickname) + '</strong>: ' + escapeHtml(qt) + '</div>';
          }
          var content = type === 'gif'
              ? '<img class="chat-gif" src="' + escapeHtml(text) + '" alt="GIF" loading="lazy" />'
              : '<p>' + escapeHtml(text) + '</p>';
          var color = getColorForNickname(msg.nickname);
          return '<div class="secret-msg-item" data-id="' + msg.id + '">' +
              '<strong style="color:' + color + ';">' + escapeHtml(msg.nickname || '') + '</strong>' +
              replyHtml + content +
              '<div class="reactions">' + renderSecretReactionsHtml(msg.id) + '</div>' +
              '<div class="msg-actions">' +
                  '<button class="action-btn" onclick="setSecretReplyById(' + msg.id + ')">↩ Responder</button>' +
                  '<button class="action-btn react-btn" onclick="toggleSecretReactionPicker(this,' + msg.id + ')">+😊</button>' +
              '</div>' +
          '</div>';
      }).join('');
      if (wasAtBottom) div.scrollTop = div.scrollHeight;
  }

  function renderSecretReactionsHtml(messageId) {
      var r = allSecretReactions[messageId] || {};
      var nick = document.getElementById("secret-nickname").value;
      return Object.keys(r).map(function(emoji) {
          var users = r[emoji] || [];
          if (users.length === 0) return '';
          var isMe = nick && users.indexOf(nick) !== -1;
          return '<button class="reaction' + (isMe ? ' reaction-mine' : '') + '" onclick="addSecretReaction(' + messageId + ',this)" data-emoji="' + escapeHtml(emoji) + '" title="' + escapeHtml(users.join(',
  ')) + '">' + emoji + ' ' + users.length + '</button>';
      }).join('');
  }

  // === Reply secreto ===

  function setSecretReplyById(messageId) {
      var msg = secretMessagesById[messageId];
      if (!msg) return;
      secretReplyingTo = { id: msg.id, nickname: msg.nickname, encryptedText: msg.text, type: msg.type || 'text' };
      var displayText = msg.type === 'gif' ? '[GIF]' : '';
      if (!displayText) {
          try {
              var bytes = CryptoJS.AES.decrypt(msg.text, secretPassword);
              displayText = (bytes.toString(CryptoJS.enc.Utf8) || '').substring(0, 60);
          } catch(e) { displayText = '...'; }
      }
      document.getElementById("secret-reply-text").textContent = msg.nickname + ': ' + displayText;
      document.getElementById("secret-reply-preview").style.display = 'flex';
      document.getElementById("secret-text").focus();
  }

  function cancelSecretReply() {
      secretReplyingTo = null;
      document.getElementById("secret-reply-preview").style.display = 'none';
  }

  // === Reacciones secretas ===

  function addSecretReaction(messageId, btnOrEmoji) {
      var nick = document.getElementById("secret-nickname").value;
      if (!nick) { alert('Pon un nickname primero.'); return; }
      var emoji = typeof btnOrEmoji === 'string' ? btnOrEmoji : btnOrEmoji.getAttribute('data-emoji');
      socket.emit("add-secret-reaction", { messageId: messageId, emoji: emoji, nickname: nick });
  }

  function toggleSecretReactionPicker(btn, messageId) {
      var existing = document.getElementById('reaction-picker');
      if (existing && secretReactionPickerTarget === messageId) {
          existing.remove(); secretReactionPickerTarget = null; return;
      }
      if (existing) existing.remove();
      secretReactionPickerTarget = messageId;
      var picker = document.createElement('div');
      picker.id = 'reaction-picker';
      picker.innerHTML = QUICK_EMOJIS.map(function(e) {
          return '<button data-emoji="' + e + '" onclick="addSecretReaction(' + messageId + ', this); closeReactionPicker();">' + e + '</button>';
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
      secretReactionPickerTarget = null;
  }

  // === Panel emojis/GIFs ===

  function togglePanel(secretMode) {
      isSecretMode = secretMode || false;
      panelOpen = !panelOpen;
      document.getElementById("media-panel").style.display = panelOpen ? 'block' : 'none';
      if (panelOpen) switchTab('emojis');
  }

  function switchTab(tab) {
      document.getElementById('tab-emojis').style.display = tab === 'emojis' ? 'block' : 'none';
      document.getElementById('tab-gifs').style.display = tab === 'gifs' ? 'block' : 'none';
      document.querySelectorAll('.panel-tab').forEach(function(b) {
          b.classList.toggle('active', (tab === 'emojis' && b.textContent.includes('Emoji')) || (tab === 'gifs' && b.textContent.includes('GIF')));
      });
      if (tab === 'gifs') searchGifs('');
  }

  document.addEventListener('emoji-click', function(e) {
      var emoji = e.detail && e.detail.unicode;
      if (!emoji) return;
      var el = document.getElementById(isSecretMode ? "secret-text" : "text");
      var pos = el.selectionStart;
      el.value = el.value.substring(0, pos) + emoji + el.value.substring(pos);
      el.selectionStart = el.selectionEnd = pos + emoji.length;
      el.focus();
  });

  function searchGifs(q) {
      clearTimeout(gifSearchTimer);
      var results = document.getElementById('gif-results');
      gifSearchTimer = setTimeout(function() {
          var url = q ? '/api/gifs?q=' + encodeURIComponent(q) : '/api/gifs';
          fetch(url)
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
      }, q ? 400 : 0);
  }

  function sendGif(idx) {
      var url = gifCache[idx];
      if (!url) return;
      if (isSecretMode) { sendSecretGif(url); return; }
      var nickname = socketNickname || document.getElementById("nickname").value.trim();
      if (!nickname) { alert('Pon un nickname primero.'); return; }
      var doIt = function(nick) {
          socket.emit("add-message", { nickname: nick, text: url, type: 'gif', replyTo: replyingTo });
          cancelReply();
          togglePanel(false);
      };
      if (!socketNickname) {
          setNickname(nickname, function(res) {
              if (res && res.ok) doIt(nickname);
              else alert(res && res.error ? res.error : 'Error');
          });
      } else {
          doIt(socketNickname);
      }
  }

  function sendSecretGif(url) {
      var nicknameEl = document.getElementById("secret-nickname");
      if (!secretNicknameSet) {
          if (!nicknameEl.value || !nicknameEl.value.trim()) { alert('Ingresa un nickname para el chat secreto.'); return; }
          nicknameEl.style.display = "none";
          secretNicknameSet = true;
      }
      var encrypted = CryptoJS.AES.encrypt(url, secretPassword).toString();
      socket.emit("add-secret-message", { nickname: nicknameEl.value, text: encrypted, type: 'gif', replyTo: secretReplyingTo });
      cancelSecretReply();
      togglePanel(false);
  }

  // === Mensaje público ===

  function addMessage() {
      var nickname = socketNickname || document.getElementById("nickname").value.trim();
      var text = document.getElementById("text").value;
      if (!text) return;
      if (!socketNickname) {
          if (!nickname) { alert('Por favor ingresa un nickname.'); return; }
          setNickname(nickname, function(res) {
              if (res && res.ok) doSend(nickname, text);
              else alert(res && res.error ? res.error : 'Error');
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
          if (res && res.ok) { socketNickname = nickname; document.getElementById("nickname").style.display = "none"; }
          if (typeof cb === 'function') cb(res);
      });
  }

  document.getElementById("text").addEventListener("input", function() {
      if (!socketNickname) return;
      if (!isTyping) { isTyping = true; socket.emit("typing", socketNickname); }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(function() { isTyping = false; socket.emit("stop-typing"); }, 2000);
  });

  // === Mensaje secreto ===

  function addSecretMessage() {
      var textEl = document.getElementById("secret-text");
      var nicknameEl = document.getElementById("secret-nickname");
      var text = textEl.value;
      if (!text) return;
      if (!secretNicknameSet) {
          if (!nicknameEl.value || !nicknameEl.value.trim()) { alert('Por favor ingresa un nickname.'); return; }
          nicknameEl.style.display = "none";
          secretNicknameSet = true;
      }
      var encrypted = CryptoJS.AES.encrypt(text, secretPassword).toString();
      socket.emit("add-secret-message", { nickname: nicknameEl.value, text: encrypted, replyTo: secretReplyingTo });
      textEl.value = "";
      cancelSecretReply();
  }

  document.getElementById("secret-text").addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addSecretMessage(); }
  });

  // === Click outside ===

  document.addEventListener('click', function(e) {
      if (!e.target.closest('#media-panel') && !e.target.closest('#media-btn') && !e.target.closest('#secret-media-btn') && panelOpen) {
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
      for (var i = 0; i < nick.length; i++) { hash = nick.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
      var c = '#';
      for (var j = 0; j < 3; j++) { var value = (hash >> (j * 8)) & 0xFF; c += ('00' + (value & 0xFF).toString(16)).substr(-2); }
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
      if (keySequence.endsWith("secret")) { keySequence = ""; e.preventDefault(); openSecretModal(); }
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

  function leaveSecretChat() {
      document.getElementById("secret-chat").style.display = "none";
      document.querySelector("h1").style.display = "";
      document.getElementById("messages").style.display = "";
      document.querySelector("form").style.display = "";
      secretPassword = null;
      secretNicknameSet = false;
      isSecretMode = false;
      cancelSecretReply();
  }

  document.getElementById("text").addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMessage(); }
  });
