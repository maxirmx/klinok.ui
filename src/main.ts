// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { createApp } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import "./styles.css";

createApp(App).use(createAppRouter()).mount("#app");
