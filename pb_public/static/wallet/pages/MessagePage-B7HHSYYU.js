// front/src/pages/MessagePage.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
window.MHR.register("MessagePage", class MessagePage extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let html = this.html;
    let title = T("Message");
    if (pageData && pageData.title) {
      title = T(pageData.title);
    }
    let msg = "";
    if (pageData && pageData.msg) {
      msg = T(pageData.msg);
    }
    let theHtml = html`
        <div class="w3-container w3-padding-64">
            <div class="w3-card-4 w3-center">
        
                <header class="w3-container w3-center color-primary">
                    <h3>${title}</h3>
                </header>
        
                <div class="w3-container">
                    <p>${msg}</p>
                </div>
                
                <div class="w3-container w3-center w3-padding">
                    <btn-primary onclick=${() => goHome()}>${T("Accept")}</btn-primary>        
                </div>

            </div>
        </div>
        `;
    this.render(theHtml);
  }
});
