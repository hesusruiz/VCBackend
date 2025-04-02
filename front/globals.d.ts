
interface storedCredential {
  hash: string;
  timestamp: number;
  type: string;
  status: string;
  encoded: string;
  decoded: Object;
}

interface credentialToStore {
  id?: string;
  encoded: string;
  type: string;
  status: string;
  decoded: any;
}

declare namespace MHR {
  function mylog(_desc: any, ...additional: any[]): Promise<void>
  function route(pageName: string, classInstance: any): void
  function goHome(): Promise<void>
  function gotoPage(pageName: string, pageData: any): Promise<void>;
  function processPageEntered(pageNameToClass: Map<string, any>, pageName: string, pageData: any, historyData: boolean): Promise<void>;
  class AbstractPage {
    constructor(id: string);
    html: Tag<HTMLElement>;
    enter(): void;
    render(html: Tag<HTMLElement>, backButton: boolean)
  }

  declare namespace storage {
    function credentialsGetAllRecent(days?: number): Promise<[storedCredential]>;
    function credentialsGetAllKeys(): Promise<[any]>;
    function credentialsDelete(key: string): Promise<void>;
    function credentialsSave(_credential: credentialToStore, replace?: boolean): Promise<storedCredential>;
  };

  function register(pageName: string, classDefinition: class): void;
  ErrorPanel: any;
  function cleanReload(): void
  let html: Tag<HTMLElement>;
  render: any;
  btoaUrl: any;
  atobUrl: any;
  pageNameToClass: any
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
