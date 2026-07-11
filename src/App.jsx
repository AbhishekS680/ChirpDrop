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

    // Do not re-initialize
    const audioCtxRef = useRef(null);
    const ggwaveRef = useRef(null);
    const instanceRef = useRef(null);

    const handleSend = async () => {
        if (!audioCtxRef.current) {
            const ctx = new AudioContext();
            const ggwave = await window.ggwave_factory();
            const params = ggwave.getDefaultParameters();
            params.sampleRateInp = ctx.sampleRate;
            params.sampleRateOut = ctx.sampleRate;
            instanceRef.current = ggwave.init(params);
            ggwaveRef.current = ggwave;
            audioCtxRef.current = ctx;
        }

            const ctx = audioCtxRef.current;
            const ggwave = ggwaveRef.current;

            // encode text to waveform
            const waveform = ggwave.encode(
            instanceRef.current,
            text,
            ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
            10
            );

            // convert Int8 -> Float32
            const buf = convertTypedArray(waveform, Float32Array);
            
            const audioBuf = ctx.createBuffer(1, buf.length, ctx.sampleRate);
            audioBuf.getChannelData(0).set(buf);
            const player = ctx.createBufferSource();
            player.buffer = audioBuf;
            player.connect(ctx.destination);
            player.start(0);
    };

    return (
    <div>
      <h1>Chirp</h1>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message"
      />
      <button onClick={handleSend}>Send</button>
      <p>{status}</p>
    </div>
  );
}
export default App
