import { createApp } from "vue";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import App from "./App.vue";
import { createAppRouter } from "./router";
import "./styles.css";

createApp(App).use(createAppRouter()).mount("#app");
