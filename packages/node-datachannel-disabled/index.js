// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

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
