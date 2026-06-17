  var express = require("express");
  var app = express();
  var cors = require('cors');
  var server = require("http").Server(app);
  var io = require("socket.io")(server);
  var crypto = require("crypto");

  app.use(cors());
  app.use('/chat', express.static("client"));
  app.use(express.static("client"));

  app.get("/hola-mundo", function(req, res){
      res.status(200).send("Hola mundo desde una ruta");
  });

  var messages = [{
      id: 1,
      text: "Bienvenido al chat de Jesus Leyva.",
      nickname: "Bot - JesusLeyva.com"
  }];

  var SECRET_HASH = crypto.createHash('sha256')
      .update(process.env.SECRET_PASSWORD || "secreto")
      .digest('hex');

  var secretMessages = [];

  setInterval(function() {
      secretMessages = [];
      io.to("secret-room").emit("secret-messages", []);
  }, 60 * 60 * 1000);

  io.on("connection", function(socket){
      console.log("Alguien se conectó. " + socket.handshake.address);
      socket.emit("messages", messages);

      socket.on("add-message", function(data){
          messages.push(data);
          io.sockets.emit("messages", messages);
      });

      socket.on("join-secret", function(passwordHash){
          if (passwordHash === SECRET_HASH) {
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
  });

  server.listen(process.env.PORT || 3700, function(){
      console.log("Servidor Funcionando.");
  });
