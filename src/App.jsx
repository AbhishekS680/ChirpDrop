import { useState, useRef } from 'react'
import './App.css'

function convertTypedArray(src, type) {
    const buffer = new ArrayBuffer(src.byteLength);
    new src.constructor(buffer).set(src);
    return new type(buffer);
}

function App() {
    const [text, setText] = useState('');
    const [status, setStatus] = useState('idle');
    const [messages, setMessages] = useState([]);

    // Do not re-initialize
    const audioCtxRef = useRef(null);
    const ggwaveRef = useRef(null);
    const instanceRef = useRef(null);
    const processorRef = useRef(null);
    const lastReceivedRef = useRef({ msg: '', time: 0 });
    const analyzerRef = useRef(null);
    const canvasRef = useRef(null);

    const ensureInit = async () => {
        if (!audioCtxRef.current) {
            const ctx = new AudioContext();
            const ggwave = await window.ggwave_factory();
            const params = ggwave.getDefaultParameters();
            params.sampleRateInp = ctx.sampleRate;
            params.sampleRateOut = ctx.sampleRate;
            instanceRef.current = ggwave.init(params);
            ggwaveRef.current = ggwave;
            audioCtxRef.current = ctx;

            const analyzer = ctx.createAnalyser();
            analyzer.fftSize = 256;
            analyzerRef.current = analyzer;

            const canvas = canvasRef.current;
            const canvasCtx = canvas.getContext('2d');
            const WIDTH = canvas.width;
            const HEIGHT = canvas.height;
            const bufferLength = analyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function draw() {
                const drawVisual = requestAnimationFrame(draw);
                analyzer.getByteTimeDomainData(dataArray);
                // Fill solid color
                canvasCtx.fillStyle = "rgb(200 200 200)";
                canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
                // Begin the path
                canvasCtx.lineWidth = 2;
                canvasCtx.strokeStyle = "rgb(0 0 0)";
                canvasCtx.beginPath();
                // Draw each point in the waveform
                const sliceWidth = WIDTH / bufferLength;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = v * (HEIGHT / 2);

                    if (i === 0) {
                    canvasCtx.moveTo(x, y);
                    } else {
                    canvasCtx.lineTo(x, y);
                    }

                    x += sliceWidth;
                }

                // Finish the line
                canvasCtx.lineTo(WIDTH, HEIGHT / 2);
                canvasCtx.stroke();
            }
            draw();
        }
    }

    // ---- Sending messages logic ----
    const handleSend = async () => {
        await ensureInit();
        
        const ctx = audioCtxRef.current;
        const ggwave = ggwaveRef.current;

        // encode text to waveform
        const waveform = ggwave.encode(
        instanceRef.current,
        text,
        ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
        50
        );

        // convert Int8 -> Float32
        const buf = convertTypedArray(waveform, Float32Array);

        const audioBuf = ctx.createBuffer(1, buf.length, ctx.sampleRate);
        audioBuf.getChannelData(0).set(buf);
        
        // plays one chirp, then schedules the next via onended
        const playChirp = (remaining) => {
            const player = ctx.createBufferSource();
            player.buffer = audioBuf;
            player.connect(ctx.destination);
            player.connect(analyzerRef.current);
            player.onended = () => {
                if (remaining > 1) {
                    setTimeout(() => playChirp(remaining - 1), 300);
                } else {
                    setStatus('idle');
                }
            };
            player.start(0);
        };
        setStatus('Sending...');
        playChirp(3); // Plays a sound three times to ensure the message is received
    };

    // ---- Listening for messages logic ----
    const handleListen = async () => {
        await ensureInit();
        const ctx = audioCtxRef.current;
        const ggwave = ggwaveRef.current;

        // Get the microphone input
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
        } catch (err) {
            setStatus('Microphone access denied');
            return;
        }

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyzerRef.current);

        // Start listening for incoming audio
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const decoded = ggwave.decode(
                instanceRef.current,
                convertTypedArray(new Float32Array(input), Int8Array)
            );
            if (decoded && decoded.length > 0) {
                const msg = new TextDecoder("utf-8").decode(decoded);
                const timeNow = Date.now();

                if (msg === lastReceivedRef.current.msg && timeNow - lastReceivedRef.current.time < 10000) {
                    return;
                }
                lastReceivedRef.current = { msg, time: timeNow };
                setMessages((prev) => [...prev, msg]);
            }
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        processorRef.current = processor;
        setStatus('Listening...');
    };

    return (
    <div>
        <h1>ChirpDrop</h1>
        <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message"
        />
        <button onClick={handleSend}>Send</button>
        <button onClick={handleListen}>Listen</button>
        <canvas ref={canvasRef} width={600} height={120} />
        <p>{status}</p>
        <ul>
            {messages.map((m, i) => (
                <li key={i}>
                    {m.startsWith('http')
                        ? <a href={m} target="_blank" rel="noreferrer">{m}</a>
                        : m}
                </li>
            ))}
        </ul>
    </div>
    );
}
export default App
