import express from 'express'
import logger from 'morgan' //dependencia utilizada para registrar informacion sobre las solicitudes que llegan al servidor
import mongoose from 'mongoose'; //dependencia utilizada para la base de datos mongoDB
import { Server } from 'socket.io' //se importa solo server del modulo, no todo el modulo
import { createServer } from 'node:http'
import dotenv from 'dotenv';
import helmet from 'helmet';

dotenv.config(); // Cargar variables de entorno desde el archivo .env

const port = process.env.PORT ?? 3000 //tomar el valor de la variable de entorno PORT, si no hay, el puerto será el 3000(normalmente utilizado para desarrollo)

const app = express() //creamos la aplicacion express quien maneja las rutas, el middleware y configuraciones necesarias para manejar solicitudes http
const server = createServer(app) //creamos "server" que representa un servidor http creado a partir de la app Express, maneja las conexiones y solicitudes de red (http y websocket).
//Debemos pasarle "app" para integrar la logica de rutas y middleware con el servidor http

//io se utiliza para manejar eventos globales relacionados con el servidor
const io = new Server(server, {
    connectionStateRecovery: {} //
}) //Creamos "io" que representa el servidor de socket.io que maneja las conexiones Websocket y todas las conexiones entre cliente y servidor
//le pasamos "server" para integrar el servidor Socket.io con el servidor http

app.use(logger('dev')) //usamos el logger morgan con el formato dev para registrar solicitudes

// Configurar Content Security Policy (CSP) con helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://vercel.live"],
            scriptSrcElem: ["'self'", "https://vercel.live"],
            connectSrc: ["'self'", "https://vercel.live"],
            imgSrc: ["'self'", "data:"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// Conectar el servidor a MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri).then(()=> { //se establece una conexion con la base de datos llamada chatapp, que se encuentra en localhost, en el puerto 27017
    console.log('Connected to MongoDB'); //si la conexion tiene exito, se imprime el mensaje en consola
}).catch((err) => { //si hubo un error al conectarse
    console.error('Error connecting to MongoDB:', err); //se imprime el mensaje de error
});

// Definir el esquema del mensaje (estructura del mensaje)
const messageSchema = new mongoose.Schema({ //se define un esquema para los documentos de la coleccion "messages" en MongoDB, dicho esquema contiene:
    content: String, //un contenido(mensaje)
    sender: String, //un emisor
    timestamp: { type: Date, default: Date.now } //fecha del mensaje
});

const Message = mongoose.model('Message', messageSchema); //se crea un modelo basado en el esquema messageSchema (objeto del modelo)

io.on('connection', async (socket) => { //cuando el cliente se conecta, se ejecuta:
    console.log('An user has connected to the chat')
    // Recuperar los últimos 10 mensajes de la base de datos
    const lastMessages = await Message.find().sort({ timestamp: -1 }).limit(25).lean().exec();
    io.emit("connection", socket.id, lastMessages.reverse()) //emitimos el evento de conexion con el id para identificar quien se conectó y los mensajes anteriores

    //socket es un objeto que representa una conexión entre el servidor y un cliente
    socket.on('disconnect', () => { //cuando el cliente se desconecta, se ejecuta:
        console.log('An user has disconnected from the chat')
        io.emit("disconnection", socket.id)
    })
    
    socket.on('chat message', async (msg) => { //si una conexion (un socket) realiza un mensaje
        // Guardar mensaje en MongoDB
        const SaveMessage = new Message({  //se crea un nuevo mensaje
            content: msg, //a "content" se le asigna el mensaje que se ha enviado
            sender: socket.id //a "sender" se le asigna el id único de la conexion de la persona
        });
        //"await" espera a que la operacion de guardado se complete antes de continuar con la ejecucion del codigo
        await SaveMessage.save(); //el metodo save guarda la constante SaveMessage (el nuevo mensaje) en la base de datos

        io.emit('chat message', msg) //el mensaje se envia a todas las conexiones (io)
    })
})

app.get('/', (req, res) => { //cuando se llame al servidor (el cliente haga una solicitud get a la url especificada):
    //se contestará al cliente con: donde se ha inicializado el proyecto + la ruta donde se encuentra el html
    res.sendFile(process.cwd() + '/client/index.html') 
})
  
server.listen(port, () => { //escucha el puerto especificado para inicializar el servidor
    console.log(`Server running on port ${port}`)
})
