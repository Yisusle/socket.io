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

// Mensajes públicos (no secreto)
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

// Usuarios conectados: nickname -> socket.id
var connectedUsers = {};

function broadcastUsers() {
    var users = Object.keys(connectedUsers).map(function(nick){
        return { nickname: nick };
    });
    io.sockets.emit('users', users);
}

setInterval(function() {
    secretMessages = [];
    io.to("secret-room").emit("secret-messages", []);
}, 60 * 60 * 1000);

io.on("connection", function(socket){
    console.log("Alguien se conectó. " + socket.handshake.address);
    // Enviar mensajes actuales y lista de usuarios
    socket.emit("messages", messages);
    socket.emit('users', Object.keys(connectedUsers).map(function(n){ return { nickname: n }; }));

    // Pedimos al cliente que establezca un nickname explícitamente
    socket.on('set-nickname', function(nickname, callback){
        if (!nickname) return callback && callback({ ok: false, error: 'Nickname vacío' });
        // Comprueba si ya existe y no pertenece a este socket
        if (connectedUsers[nickname] && connectedUsers[nickname] !== socket.id) {
            return callback && callback({ ok: false, error: 'Ya existe ese nickname' });
        }
        // Si este socket ya tenía otro nickname, bórralo
        if (socket.nickname && connectedUsers[socket.nickname]) {
            delete connectedUsers[socket.nickname];
        }
        socket.nickname = nickname;
        connectedUsers[nickname] = socket.id;
        broadcastUsers();
        return callback && callback({ ok: true });
    });

    socket.on("add-message", function(data){
        // Verificar que el socket tenga un nickname válido
        var nickname = data && data.nickname ? data.nickname : socket.nickname;
        if (!nickname) {
            // Rechazar si no hay nickname
            socket.emit('error-message', 'Debes establecer un nickname antes de enviar mensajes.');
            return;
        }
        // Si el nickname no está registrado para este socket, intentar registrarlo
        if (!connectedUsers[nickname]) {
            // Si el nickname está en uso por otro socket, rechazamos
            // (siempre que exista en connectedUsers y no sea este socket)
            // Pero connectedUsers[nickname] === undefined aquí, así que lo asignamos
            connectedUsers[nickname] = socket.id;
            socket.nickname = nickname;
            broadcastUsers();
        } else if (connectedUsers[nickname] !== socket.id) {
            // Ya lo tomó otro
            socket.emit('nickname-taken', nickname);
            return;
        }

        var text = data.text || '';
        if (!text) return;

        var msg = { id: Date.now(), text: text, nickname: nickname, ts: Date.now() };
        messages.push(msg);
        if (messages.length > 500) messages.shift();

        io.sockets.emit("messages", messages);
    });

    socket.on("join-secret", function(password){
      var hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash === SECRET_HASH) {
          socket.join("secret-room");
          socket.emit("secret-joined", secretMessages);
      } else {
          socket.emit("secret-denied");
      }
  });

    socket.on("add-secret-message", function(data){
        secretMessages.push(data);
        io.to("secret-room").emit("secret-messages", secretMessages);
    });

    socket.on('disconnect', function(){
        if (socket.nickname && connectedUsers[socket.nickname]) {
            delete connectedUsers[socket.nickname];
            broadcastUsers();
        }
        console.log('Se desconectó: ' + socket.id);
    });
});

server.listen(process.env.PORT || 3700, function(){
    console.log("Servidor Funcionando.");
});
