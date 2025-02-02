// front/src/pages/CalendarPage.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
window.MHR.register("CalendarPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter() {
    let html = this.html;
    var theHtml = html`
        <div id='calendar'></div>
        `;
    this.render(theHtml, true);
    var calendarEl = document.getElementById("calendar");
    var calendar = new window.FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth"
    });
    calendar.render();
  }
});
