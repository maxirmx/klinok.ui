// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { createApp } from "vue";
import { createPinia } from "pinia";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import App from "./App.vue";
import { createAppRouter } from "./router";
import "./styles.css";

const pinia = createPinia();
const router = createAppRouter(pinia);

createApp(App).use(pinia).use(router).mount("#app");
