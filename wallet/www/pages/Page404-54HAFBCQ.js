import {
  html
} from "../chunks/chunk-N7Z3OPHA.js";
import "../chunks/chunk-66PNVI35.js";

// front/src/pages/Page404.js
window.MHR.register("Page404", class Page404 extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let theHtml = html`
        <div class="w3-container">
            <h2>The requested page does not exist: ${pageData}</h2>
        </div>
        `;
    this.render(theHtml);
  }
});
