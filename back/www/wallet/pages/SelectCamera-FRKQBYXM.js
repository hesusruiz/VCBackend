import {
  getPreferredVideoDevice
} from "../chunks/chunk-RC4ORKZO.js";
import "../chunks/chunk-65N62L2T.js";
import "../chunks/chunk-KRYK5JSZ.js";

// front/src/pages/SelectCamera.js
window.MHR.register("SelectCamera", class SelectCamera extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    let html2 = this.html;
    try {
      var preferredVideoDevices = await getPreferredVideoDevice();
      if (preferredVideoDevices.videoDevices.length == 0) {
        this.render(html2`<p>No camera available</p>`);
        return;
      }
      var videoDevices = preferredVideoDevices.videoDevices;
    } catch (error) {
      this.render(html2`<p>No camera available</p>`);
      return;
    }
    let theHtml = html2`
<section class="w3-container">
    <h2>Select a camera</h2>
    <div class="w3-bar-block w3-card">
        ${videoDevices.map(
      (camera) => html2`
        <a class="w3-bar-item w3-btn w3-border" @click=${() => this.setCamera(camera.deviceId)} href="javascript:void(0)">
            <p class="w3-medium">${camera.label}</p>
        </a>`
    )}
    </div>
</section>`;
    this.render(theHtml);
  }
  async setCamera(l) {
    window.selectedCamera = l;
    localStorage.setItem("selectedCamera", l);
    window.history.back();
  }
});
