  var express = require("express");
  var app = express();
  var cors = require('cors');
  var server = require("http").Server(app);
  var io = require("socket.io")(server);
  var crypto = require('crypto');

  app.use(cors());
  app.use('/chat', express.static("client"));
  app.use(express.static("client"));

  app.get("/hola-mundo", function(req, res){
      res.status(200).send("Hola mundo desde una ruta");
  });

  app.get("/api/gifs", function(req, res) {
      var q = req.query.q || '';
      var apiKey = process.env.GIPHY_API_KEY || '';
      if (!apiKey) return res.json({ data: [] });
      var url = q
          ? 'https://api.giphy.com/v1/gifs/search?api_key=' + apiKey + '&q=' + encodeURIComponent(q) +
  '&limit=12&rating=g'
          : 'https://api.giphy.com/v1/gifs/trending?api_key=' + apiKey + '&limit=12&rating=g';
      fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) { res.json(data); })
          .catch(function() { res.json({ data: [] }); });
  });

  var messages = [{
      id: Date.now(),
      text: "Bienvenido al chat de Jesus Leyva.",
      nickname: "Bot - JesusLeyva.com",
      ts: Date.now()
  }];

  var SECRET_HASH = crypto.createHash('sha256')
      .update(process.env.SECRET_PASSWORD || "secreto")
      .digest('hex');

  var secretMessages = [];
  var secretReactions = {};
  var secretUsers = {};
  var connectedUsers = {};
  var reactions = {};
  var typingUsers = {};

  function broadcastUsers() {
      var users = Object.keys(connectedUsers).map(function(nick){ return { nickname: nick }; });
      io.sockets.emit('users', users);
  }

  function broadcastSecretUsers() {
      var users = Object.values(secretUsers).map(function(nick){ return { nickname: nick }; });
      io.to("secret-room").emit("secret-users", users);
  }

  setInterval(function() {
      secretMessages = [];
      secretReactions = {};
      io.to("secret-room").emit("secret-messages", []);
      io.to("secret-room").emit("secret-reactions", {});
  }, 60 * 60 * 1000);

  io.on("connection", function(socket){
      console.log("Alguien se conectó. " + socket.handshake.address);
      socket.emit("messages", messages);
      socket.emit("reactions", reactions);
      socket.emit('users', Object.keys(connectedUsers).map(function(n){ return { nickname: n }; }));

      socket.on('set-nickname', function(nickname, callback){
          if (!nickname) return callback && callback({ ok: false, error: 'Nickname vacío' });
          if (connectedUsers[nickname] && connectedUsers[nickname] !== socket.id)
              return callback && callback({ ok: false, error: 'Ya existe ese nickname' });
          if (socket.nickname && connectedUsers[socket.nickname]) delete connectedUsers[socket.nickname];
          socket.nickname = nickname;
          connectedUsers[nickname] = socket.id;
          broadcastUsers();
          return callback && callback({ ok: true });
      });

      socket.on("set-secret-nickname", function(nickname) {
          if (!nickname) return;
          secretUsers[socket.id] = nickname;
          broadcastSecretUsers();
      });

      socket.on("leave-secret", function() {
          delete secretUsers[socket.id];
          socket.leave("secret-room");
          broadcastSecretUsers();
      });

      socket.on("add-message", function(data){
          var nickname = data && data.nickname ? data.nickname : socket.nickname;
          if (!nickname) { socket.emit('error-message', 'Debes establecer un nickname.'); return; }
          if (!connectedUsers[nickname]) {
              connectedUsers[nickname] = socket.id;
              socket.nickname = nickname;
              broadcastUsers();
          } else if (connectedUsers[nickname] !== socket.id) {
              socket.emit('nickname-taken', nickname); return;
          }
          var text = data.text || '';
          if (!text) return;
          var msg = { id: Date.now(), text: text, nickname: nickname, ts: Date.now(), type: data.type || 'text',
  replyTo: data.replyTo || null };
          messages.push(msg);
          if (messages.length > 500) messages.shift();
          io.sockets.emit("messages", messages);
      });

      socket.on("add-reaction", function(data){
          if (!data || !data.messageId || !data.emoji || !data.nickname) return;
          if (!reactions[data.messageId]) reactions[data.messageId] = {};
          if (!reactions[data.messageId][data.emoji]) reactions[data.messageId][data.emoji] = [];
          var users = reactions[data.messageId][data.emoji];
          var idx = users.indexOf(data.nickname);
          if (idx === -1) users.push(data.nickname);
          else { users.splice(idx, 1); if (users.length === 0) delete reactions[data.messageId][data.emoji]; }
          io.sockets.emit("reaction-update", { messageId: data.messageId, reactions: reactions[data.messageId] || {} });
      });

      socket.on("add-secret-reaction", function(data){
          if (!data || !data.messageId || !data.emoji || !data.nickname) return;
          if (!secretReactions[data.messageId]) secretReactions[data.messageId] = {};
          if (!secretReactions[data.messageId][data.emoji]) secretReactions[data.messageId][data.emoji] = [];
          var users = secretReactions[data.messageId][data.emoji];
          var idx = users.indexOf(data.nickname);
          if (idx === -1) users.push(data.nickname);
          else { users.splice(idx, 1); if (users.length === 0) delete secretReactions[data.messageId][data.emoji]; }
          io.to("secret-room").emit("secret-reaction-update", { messageId: data.messageId, reactions:
  secretReactions[data.messageId] || {} });
      });

      socket.on("typing", function(nickname){
          if (!nickname) return;
          typingUsers[socket.id] = nickname;
          socket.broadcast.emit("typing-update", Object.values(typingUsers));
      });

      socket.on("stop-typing", function(){
          delete typingUsers[socket.id];
          socket.broadcast.emit("typing-update", Object.values(typingUsers));
      });

      socket.on("join-secret", function(password){
          var hash = crypto.createHash('sha256').update(password).digest('hex');
          if (hash === SECRET_HASH) {
              socket.join("secret-room");
              socket.emit("secret-joined", secretMessages);
              socket.emit("secret-reactions", secretReactions);
              socket.emit("secret-users", Object.values(secretUsers).map(function(nick){ return { nickname: nick }; }));
          } else {
              socket.emit("secret-denied");
          }
      });

      socket.on("add-secret-message", function(data){
          var msg = { id: Date.now(), nickname: data.nickname, text: data.text, type: data.type || 'text', replyTo:
  data.replyTo || null };
          secretMessages.push(msg);
          if (secretMessages.length > 200) secretMessages.shift();
          io.to("secret-room").emit("secret-messages", secretMessages);
      });

      socket.on('disconnect', function(){
          if (socket.nickname && connectedUsers[socket.nickname]) {
              delete connectedUsers[socket.nickname];
              broadcastUsers();
          }
          if (secretUsers[socket.id]) {
              delete secretUsers[socket.id];
              broadcastSecretUsers();
          }
          delete typingUsers[socket.id];
          socket.broadcast.emit("typing-update", Object.values(typingUsers));
          console.log('Se desconectó: ' + socket.id);
      });
  });

  server.listen(process.env.PORT || 3700, function(){ console.log("Servidor Funcionando."); });
