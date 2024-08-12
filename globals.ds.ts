interface Window {
    MHR: {
        mylog: any,
        storage: any,
        route: any,
        goHome: any,
        gotoPage: any,
        processPageEntered: any,
        AbstractPage: any,
        register: any,
        ErrorPanel: any,
        cleanReload: any,
        html: any,
        render: any,
        btoaUrl: any,
        atobUrl: any,
        pageNameToClass: any
    }
  }

/**
 * Return single element. Selector not needed if used with inline <script> 🔥
 * If your query returns a collection, it will return the first element.
 * Example
 *   <div>
 *     Hello World!
 *     <script>me().style.color = 'red'</script>
 *   </div>
 * @param selector The selector to the HTMLElement
 */
declare function me(selector: any): any

  
/**
 * This function is used in runtime to get translated text
 * @param translatable The string to translate
 */
declare function T(translatable: string): string;