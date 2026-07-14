const unsupported = () => {
  throw new Error(
    "Node WebRTC отключён в Klinok: настройте и используйте WebSocket-транспорт"
  );
};

export class PeerConnection {
  constructor() {
    unsupported();
  }
}

export class IceUdpMuxListener {
  constructor() {
    unsupported();
  }
}
