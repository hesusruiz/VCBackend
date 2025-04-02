let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage

window.MHR.register("CalendarPage", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    enter() {
        let html = this.html
        

        var theHtml = html`
        <div id='calendar'></div>
        `       
        this.render(theHtml, true)

        var calendarEl = document.getElementById('calendar');
        var calendar = new window.FullCalendar.Calendar(calendarEl, {
          initialView: 'dayGridMonth'
        });
        calendar.render()
    }
})


