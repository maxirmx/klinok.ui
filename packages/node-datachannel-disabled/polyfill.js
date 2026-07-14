const unsupported = () => {
  throw new Error(
    "Node WebRTC отключён в Klinok: настройте и используйте WebSocket-транспорт"
  );
};

export class RTCPeerConnection {
  constructor() {
    unsupported();
  }
}

export class RTCSessionDescription {
  constructor() {
    unsupported();
  }
}

export class RTCIceCandidate {
  constructor() {
    unsupported();
  }
}
