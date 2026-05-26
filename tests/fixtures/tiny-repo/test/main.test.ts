import { add } from "../src/main";

if (add(1, 2) !== 3) {
  throw new Error("bad add");
}
