var express = require("express");
var app = express();
var cors = require('cors');
var helmet = require('helmet');
var server = require("http").Server(app);
var io = require("socket.io")(server);

app.use(cors());

// Configura helmet para permitir scripts inline
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://<tu-proyecto>.vercel.app"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]
    }
  }
}));

app.use('/chat', express.static("client"));

app.use(express.static("client"));

app.get("/hola-mundo", function(req, res){
    res.status(200).send("Hola mundo desde una ruta");
});

var messages = [{
    id:1,
    text: "Bienvenido al chat de Jesus Leyva.",
    nickname: "Bot - JesusLeyva.com"
}];

io.on("connection", function(socket){
    console.log("Alguien se conectó. " + socket.handshake.address);
    socket.emit("messages", messages);

    socket.on("add-message", function(data){
        messages.push(data);
        io.sockets.emit("messages", messages);
    });

});

//6677
server.listen(3700, function(){
    console.log("Servidor Funcionando.");
});