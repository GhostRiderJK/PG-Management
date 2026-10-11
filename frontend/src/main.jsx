import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { Providers } from "./ui.jsx";
import "./styles.css";

const saved = localStorage.getItem("pg_theme");
document.documentElement.dataset.theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

ReactDOM.createRoot(document.getElementById("root")).render(
  <Providers><App /></Providers>
);
