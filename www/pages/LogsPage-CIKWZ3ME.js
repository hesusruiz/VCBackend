import {
  log
} from "../chunks/chunk-BFXLU5VG.js";
import "../chunks/chunk-U2D4LOFI.js";
import "../chunks/chunk-66PNVI35.js";

// front/src/pages/LogsPage.js
var version = "1.0.1";
function shortDate(timestamp) {
  let date = new Date(timestamp);
  return `${date.toISOString()}`;
}
window.MHR.register("LogsPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter() {
    let html2 = this.html;
    let items = [];
    for (let i = 0; i < log.num_items(); i++) {
      items.push(log.item(i));
    }
    let theHtml = html2`
        <div class="w3-container">
            <h2>${T("Technical logs")} (${version})</h2>
        </div>

        <ion-list>
            ${items.map(
      ({ timestamp, desc, item }, i) => html2`<ion-item><ion-label>${shortDate(timestamp)}-${desc} ${item}</ion-label></ion-item>`
    )}
        </ion-list>

        `;
    this.render(theHtml);
  }
});
