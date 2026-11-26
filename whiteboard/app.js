import { connect } from "/_stellarr/sdk/v1.js";
import { boot, fail } from "./src/main.js";

const root = document.getElementById("app");
boot(connect, root).catch((error) => fail(root, error));
