const cors = require("cors");

const allowedOrigins = [
    "http://localhost:5173",
    "http://10.147.140.42:5173"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));