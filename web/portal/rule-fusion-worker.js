import { fusion } from "../../problems/fusion/index.js";

self.onmessage = ({ data }) => {
  try {
    const report = fusion.design(data);
    self.postMessage({ report });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
