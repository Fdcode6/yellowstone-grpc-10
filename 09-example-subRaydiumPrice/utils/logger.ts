import pino from "pino";

  
const stream = pino.multistream([pino.destination("./logs/log.log"), process.stdout]);
const logger = pino(
    {
        transport: {
            target: "pino-pretty",
            options: {
            ignore: "pid,hostname",
            },
        },
        base: null,
    }, 
    stream); 


export default logger;