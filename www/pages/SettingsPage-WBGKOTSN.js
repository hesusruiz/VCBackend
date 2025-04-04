import "../chunks/chunk-TEA6LPUJ.js";
import "../chunks/chunk-3475HZHE.js";
import "../chunks/chunk-CJ4ZD2TO.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/pages/SettingsPage.js
var MHR = window.MHR;
var gotoPage = MHR.gotoPage;
var goHome = MHR.goHome;
var storage = MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = MHR.html;
MHR.register(
  "SettingsPage",
  class extends MHR.AbstractPage {
    /**
     * @param {string} id
     */
    constructor(id) {
      super(id);
    }
    async enter() {
      this.render(mainPage);
    }
  }
);
var mainPage = html`
   <ion-card>
      <ion-item>
         <ion-toggle
            @ionChange=${(e) => {
  MHR.debug = e.target.checked;
  window.localStorage.setItem("MHRdebug", e.target.checked);
  console.log("DEBUG", MHR.debug);
}}
            id="Debug"
            name="Debug"
            label-placement="end"
            justify="start"
            checked
            >Set debug mode
         </ion-toggle>
      </ion-item>
   </ion-card>
`;
