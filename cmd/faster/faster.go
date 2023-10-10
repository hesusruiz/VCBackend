package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/valyala/fasttemplate"

	"errors"

	"github.com/evanw/esbuild/pkg/api"

	"flag"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/proxy"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/otiai10/copy"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
)

const (
	defaultConfigFile              = "./data/config/devserver.yaml"
	defaultsourcedir               = "front/src"
	defaulttargetdir               = "docs"
	defaulthtmlfile                = "index.html"
	defaultentryPoints             = "app.js"
	defaultpagedir                 = "/pages"
	defaultstaticAssets_source     = "front/src/public"
	defaultstaticAssets_target     = "docs"
	defaultsubdomainprefix         = "/faster"
	defaultdevserver_listenAddress = ":3500"
	defaultdevserver_autobuild     = true
)

var (
	configFile = flag.String("config", LookupEnvOrString("CONFIG_FILE", defaultConfigFile), "path to configuration file")
	autobuild  = flag.Bool("auto", true, "Perform build on every request to the root path")
)

func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

type Application struct {
	cfg *yaml.YAML
}

// main starts the build process, with the option of starting a development
// server for tool-less workflows
func main() {

	// Initialize the log and its format
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	zlog.Logger = zlog.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	zlog.Logger = zlog.With().Caller().Logger()

	var result api.BuildResult

	flag.Usage = func() {
		fmt.Printf("Usage of faster (v0.5)\n")
		fmt.Println("  faster build\tBuild the application")
		fmt.Println("  faster serve\tStart a development server that builds automatically when reloading")
		fmt.Println()
		fmt.Println("faster uses a configuration file named 'devserver.yaml' located in the current directory.")
		fmt.Println()
		fmt.Println("The development server has the following flags:")
		flag.PrintDefaults()
	}

	// Parse the cli flags
	flag.Parse()
	argsCmd := flag.Args()

	app := &Application{}

	// Read the configuration file
	cfg := readConfiguration(*configFile)
	app.cfg = cfg

	// Prepare the arguments map
	args := map[string]bool{}
	for _, arg := range argsCmd {
		args[arg] = true
	}

	// Perform a standard build if no arguments specified
	if len(args) == 0 {
		args["build"] = true
	}

	// This is here to facilitate experiments
	if args["test"] {
		performExperiments(cfg)
		os.Exit(0)
	}

	// Extract dependencies and prebuild them
	if args["deps"] {
		result = buildDeps(cfg)
	}

	// Perform a standard build
	if args["build"] {
		result = Build(cfg)
	}

	// Watch and build
	if args["watch"] {
		watchAndBuild(cfg)
		os.Exit(0)
	}

	// Display information about the bundling results
	if args["meta"] {
		if len(result.Metafile) > 0 {
			fmt.Println("*******************************")
			text := api.AnalyzeMetafile(result.Metafile, api.AnalyzeMetafileOptions{})
			fmt.Printf("%s", text)
			fmt.Println("*******************************")
		}
	}

	// Start the development web server, serving requests until stopped
	if args["serve"] {
		DevServer(cfg)
		<-make(chan bool)
	}

}

// Build performs a standard Build
func Build(cfg *yaml.YAML) api.BuildResult {
	// processTemplates(cfg)
	source := cfg.String("sourcedir")
	target := cfg.String("targetdir")
	fmt.Printf("Building: %s --> %s\n", source, target)

	preprocess(cfg)
	result := buildAndBundle(cfg)
	// processResult(result, cfg)
	copyStaticAssets(cfg)
	postprocess(result, cfg)

	return result

}

// preprocess is executed before build, for example to clean the target directory
func preprocess(cfg *yaml.YAML) {
	if cfg.Bool("cleantarget") {
		deleteTargetDir(cfg)
	}
}

// Clean the target directory from all build artifacts
func deleteTargetDir(cfg *yaml.YAML) {
	targetDir := cfg.String("targetdir", defaulttargetdir)
	if len(targetDir) > 0 {
		os.RemoveAll(targetDir)
	}
}

// buildAndBundle uses ESBUILD to build and bundle js/css files
func buildAndBundle(cfg *yaml.YAML) api.BuildResult {

	// Generate the options structure
	options := buildOptions(cfg)

	// Run ESBUILD
	result := api.Build(options)

	// Print any errors
	printErrors(result.Errors)
	if len(result.Errors) > 0 {
		os.Exit(1)
	}

	return result

}

// Generate the build options struct for ESBUILD
func buildOptions(cfg *yaml.YAML) api.BuildOptions {

	// The base input directory of the project
	sourceDir := cfg.String("sourcedir", defaultsourcedir)

	// Build an array with the relative path of the main entrypoints
	entryPoints := cfg.ListString("entryPoints")
	for i := range entryPoints {
		entryPoints[i] = filepath.Join(sourceDir, entryPoints[i])
	}

	// The pages are also entrypoints to process, because they are lazy-loaded
	pages := pageEntryPoints(cfg)

	// Consolidate all entrypoints in a single list
	entryPoints = append(entryPoints, pages...)

	options := api.BuildOptions{
		EntryPoints: entryPoints,
		Format:      api.FormatESModule,
		Outdir:      cfg.String("targetdir"),
		Write:       true,
		Bundle:      true,
		Splitting:   true,
		ChunkNames:  "chunks/[name]-[hash]",
		Define: map[string]string{
			"JR_IN_DEVELOPMENT": "true",
		},
		Loader: map[string]api.Loader{
			".png": api.LoaderDataURL,
			".svg": api.LoaderText,
		},
		Metafile: true,
		Charset:  api.CharsetUTF8,
	}

	if cfg.Bool("hashEntrypointNames") {
		options.EntryNames = "[dir]/[name]-[hash]"
	}

	return options
}

// postprocess is executed after the build for example to modify the resulting files
func postprocess(r api.BuildResult, cfg *yaml.YAML) error {

	// Get the metafile data and parse it as a string representing a JSON file
	meta, err := yaml.ParseJson(r.Metafile)
	if err != nil {
		return err
	}

	// Get the outputs field, which is a map with the key as each output file name
	outputs := meta.Map("outputs")
	if err != nil {
		return err
	}

	targetFullDir := cfg.String("pagedir", defaultpagedir)

	// Get a map of the source entrypoints full path, by getting the list in the config file
	// and prepending the source directory path
	sourceDir := cfg.String("sourcedir", defaultsourcedir)
	entryPoints := cfg.ListString("entryPoints")
	entryPointsMap := map[string]bool{}
	for i := range entryPoints {
		entryPointsMap[filepath.Join(sourceDir, entryPoints[i])] = true
	}

	// Get a list of the pages of the application, to generate the routing page map
	// This is the list of file path names in the pagesdir directory, relative to sourcedir
	pageSourceFileNames := pageEntryPointsAsMap(cfg)

	// pageNamesMapping will be a mapping between the page name (the file name without the path and extension),
	// and the full file path for the corresponding target file with the JavaScript code for the page.
	// This will be used for dynamic loading of the code when routing to a given page name. The router will
	// dynamically load the JavascriptFile before giving control to the page entry point
	pageNamesMapping := map[string]string{}

	// rootEntryPointMap is a mapping between the target name of the entry point (possibly including its hash in the name),
	// and the CSS file bundle that is associated to that entry point (possibly because some CSS was imported by the entrypoint
	// or its dependencies).
	rootEntryPointMap := map[string]string{}

	// Iterate over all output files in the metadata file
	// Find the source entrypoint in the output metadata map
	for outFile, metaData := range outputs {
		outMetaEntry := yaml.New(metaData)

		// The name of the source entrypoint file
		outEntryPoint := outMetaEntry.String("entryPoint")

		// Get the base name for the outfile of the entrypoint
		outFileBaseName := filepath.Base(outFile)

		// Get the base name for the CSS bundle corresponding to the entrypoint
		cssBundleBasename := filepath.Base(outMetaEntry.String("cssBundle"))

		// If the entry point of this outfile is in the configured list of entrypoints
		if entryPointsMap[outEntryPoint] {

			// Add an entry to the root entry point map
			rootEntryPointMap[outFile] = cssBundleBasename

			fmt.Println("entryPoint:", outEntryPoint, "-->", outFileBaseName, "+", cssBundleBasename)

		}

		// If this entry corresponds to a file in the source page directory
		if pageSourceFileNames[outEntryPoint] {

			// Get the page pageName (the pageName of the file without path or extension)
			pageName := strings.TrimSuffix(filepath.Base(outEntryPoint), filepath.Ext(filepath.Base(outEntryPoint)))

			// Get the path of the file in the output, relative to the target directory for serving the file
			targetPageFilePath := filepath.Join(targetFullDir, outFileBaseName)

			// Add an entry in the page mapping
			pageNamesMapping[pageName] = targetPageFilePath

		}
	}

	// We are going to modify the HTML file to:
	// - Load the JavaScript main entrypoints
	// - Load the associated CSS bundles (one for each entrypoint)

	pageNamesMappingJSON, _ := json.MarshalIndent(pageNamesMapping, "", "  ")

	indexFilePath := path.Join(cfg.String("targetdir"), "index.html")

	// Read the contents of the output HTML file
	bytesOut, err := os.ReadFile(indexFilePath)
	if err != nil {
		log.Fatal(err)
	}

	for outFile, cssBundleBasename := range rootEntryPointMap {

		// Get the base name for the outfile of the entrypoint
		outFileBaseName := path.Join(cfg.String("subdomainprefix"), filepath.Base(outFile))
		fullCSS := path.Join(cfg.String("subdomainprefix"), cssBundleBasename)

		// Replace the entrypoint name for JavaScript
		bytesOut = bytes.Replace(bytesOut, []byte("PUT_APP_JS_NAME_HERE"), []byte(outFileBaseName), 1)

		// Replace the entrypoint name for CSS
		bytesOut = bytes.Replace(bytesOut, []byte("PUT_APP_CSS_NAME_HERE"), []byte(fullCSS), 1)

		bytesOut = bytes.Replace(bytesOut, []byte("PUT_PAGEMAP_HERE"), pageNamesMappingJSON, 1)

	}

	template := string(bytesOut)
	t := fasttemplate.New(template, "{{", "}}")
	str := t.ExecuteString(map[string]interface{}{
		"subdomainprefix": cfg.String("subdomainprefix"),
	})

	// Overwrite file with modified contents
	err = os.WriteFile(indexFilePath, []byte(str), 0755)
	if err != nil {
		log.Fatal(err)
	}

	return nil

}

func buildDeps(cfg *yaml.YAML) api.BuildResult {
	// processTemplates(cfg)

	preprocess(cfg)
	result := buildDependencies(cfg)

	return result

}

func performExperiments(cfg *yaml.YAML) api.BuildResult {
	return api.BuildResult{}
}

// pageEntryPointsAsMap returns a map with all source page file names (path relative to sourcedir) in the application,
// which will be entrypoints for the building process.
func pageEntryPointsAsMap(cfg *yaml.YAML) map[string]bool {

	// The directory where the pages are located
	pageDir := filepath.Join(cfg.String("sourcedir", defaultsourcedir), cfg.String("pagedir", defaultpagedir))

	// Get the files in the directory
	files, err := os.ReadDir(pageDir)
	if err != nil {
		log.Fatal(err)
	}

	// Create the list of pages with the full path (relative to the sourcedir directory)
	pageMap := map[string]bool{}
	for _, file := range files {
		pageMap[filepath.Join(pageDir, file.Name())] = true
	}

	return pageMap
}

func buildOptionsDependencies(cfg *yaml.YAML) api.BuildOptions {

	// The JavaScript entrypoints
	entryPoints := cfg.ListString("dependencies")

	options := api.BuildOptions{
		EntryPoints: entryPoints,
		Format:      api.FormatESModule,
		Outdir:      cfg.String("targetdir"),
		Write:       true,
		Bundle:      true,
		Splitting:   false,
		ChunkNames:  "chunks/[name]-[hash]",
		Loader: map[string]api.Loader{
			".png": api.LoaderDataURL,
			".svg": api.LoaderText,
		},

		// EntryNames: "[dir]/[name]-[hash]",
		// Metafile:   true,
	}

	return options
}

func buildDependencies(cfg *yaml.YAML) api.BuildResult {
	fmt.Println("Building dependencies")

	options := buildOptionsDependencies(cfg)
	result := api.Build(options)

	printErrors(result.Errors)
	if len(result.Errors) > 0 {
		os.Exit(1)
	}

	return result
}

func printErrors(resultErrors []api.Message) {
	if len(resultErrors) > 0 {
		for _, msg := range resultErrors {
			fmt.Printf("%v\n", msg.Text)
		}
	}
}

// copyStaticAssets copies without any processing the files from the staticAssets directory
// to the target directory in the root.
// The structure of the source directory is replicated in the target.
// A file 'images/example.png' in the source staticAssets directory will be accessed as '/images/example.png'
// via the web.
func copyStaticAssets(cfg *yaml.YAML) {
	sourceDir := cfg.String("staticAssets.source", defaultstaticAssets_source)
	targetDir := cfg.String("staticAssets.target", defaultstaticAssets_target)

	// Copy the source directory to the target root
	err := copy.Copy(sourceDir, targetDir)
	if err != nil {
		panic(err)
	}

	// HTML files are a special case of static assets. The common case for a PWA is that there is just
	// one html file in the root of the project source directory.
	// In the future, the 'htmlfiles' entry may be used to pre-process the html files in special ways
	pages := cfg.ListString("htmlfiles", []string{defaulthtmlfile})

	sourceDir = cfg.String("sourcedir", defaultsourcedir)
	targetDir = cfg.String("targetdir", defaulttargetdir)

	// Copy all HTML files from source to target
	for _, page := range pages {
		sourceFile := filepath.Join(sourceDir, page)
		targetFile := filepath.Join(targetDir, page)
		// copyFile(sourceFile, targetFile)
		copy.Copy(sourceFile, targetFile)
	}

}

func readConfiguration(configFile string) *yaml.YAML {
	var cfg *yaml.YAML
	var err error

	cfg, err = yaml.ParseYamlFile(configFile)
	if err != nil {
		fmt.Printf("Config file not found\n")
		panic(err)
	}
	return cfg
}

// pageEntryPoints returns an array with all pages in the application, which will be entrypoints
// for the building process.
func pageEntryPoints(cfg *yaml.YAML) []string {

	// The directory where the pages are located
	pageDir := filepath.Join(cfg.String("sourcedir", defaultsourcedir), cfg.String("pagedir", defaultpagedir))

	// Get the files in the directory
	files, err := os.ReadDir(pageDir)
	if err != nil {
		log.Fatal(err)
	}

	// Create the list of pages with the full path
	pageList := make([]string, len(files))
	for i, file := range files {
		pageList[i] = filepath.Join(pageDir, file.Name())
	}

	return pageList
}

func printJSON(val any) {
	out, err := json.MarshalIndent(val, "", "  ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
}

func processTemplates(cfg *yaml.YAML) {

	parseGlob := filepath.Join(cfg.String("templates.dir"), "*.tpl")

	t, err := template.ParseGlob(parseGlob)
	if err != nil {
		panic(err)
	}

	var out bytes.Buffer

	for _, elem := range cfg.List("templates.elems") {
		ele := yaml.New(elem)
		name := ele.String("name")
		data := ele.Map("data")
		fmt.Printf("Name: %v Data: %v\n", name, data)
		err = t.ExecuteTemplate(&out, name, data)
		if err != nil {
			panic(err)
		}
		// fmt.Println(string(out.Bytes()))
	}

}

// The Server struct handles the server state
type Server struct {
	*fiber.App
}

// DevServer is a simple development server to help develop PWAs in a
// tool-less fashion.
// It supports serving static files locally for the user interface, and
// proxying other API requests to another server.
func DevServer(cfg *yaml.YAML) {

	// Define the configuration for Fiber
	fiberCfg := fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			zlog.Err(err).Msg("Error handler")
			c.Set(fiber.HeaderContentType, fiber.MIMETextPlainCharsetUTF8)
			return c.Status(code).SendString(err.Error())
		},
	}

	// Create the fiber web server
	server := Server{
		App: fiber.New(fiberCfg),
	}

	// Middleware to recover from panics
	server.Use(recover.New(recover.Config{EnableStackTrace: true}))

	// Configure logging
	server.Use(logger.New(logger.Config{
		// TimeFormat: "02-Jan-1985",
		TimeZone: "Europe/Brussels",
	}))

	// Proxy all requests (GET, POST, PUT, etc) for the given prefix
	proxyList := cfg.List("devserver.proxy")
	for _, p := range proxyList {
		proxy := yaml.New(p)
		server.All(proxy.String("route"), proxyHandler(proxy.String("target")))
		fmt.Println("Forwarding", proxy.String("route"), "to", proxy.String("target"))
	}

	// Serve locally from disk all requests not matching the routes above
	server.Get("/*", func(c *fiber.Ctx) error {

		// Get the name of the requested file (or path)
		fileName := c.Path()

		// If the request is for the root, perform a standard build if configured
		if fileName == "/" {
			// Set the filename to index.html
			fileName = "/index.html"
			// Build if configured
			if *autobuild || cfg.Bool("devserver.autobuild", defaultdevserver_autobuild) {
				fmt.Println("<<<<<<<<<<<< Building >>>>>>>>>>>>>")
				Build(cfg)
			}

		}

		// Get the full path name for the directory serving the files
		filePath := filepath.Join(cfg.String("targetdir"), fileName)

		// Read the file in memory
		buf, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}

		// Disable the cache in the browser, so it is always the last version
		c.Set("Cache-Control", "no-store")

		// Set the MIME-type in the response acceording to the file extension
		c.Type(filepath.Ext(fileName))

		// Send the file to the browser
		fmt.Println("Sending:", filePath)
		return c.Send(buf)

	})

	// Listen on configured port
	log.Fatal(server.Listen(cfg.String("devserver.listenAddress", defaultdevserver_listenAddress)))
}

// proxyHandler is a general proxy forwarder with no logic to modify
// request or reply
func proxyHandler(targetHost string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		targetURL := targetHost + c.OriginalURL()
		if err := proxy.Do(c, targetURL); err != nil {
			return err
		}
		return nil
	}
}

// Depending on the system, a single "write" can generate many Write events; for
// example compiling a large Go program can generate hundreds of Write events on
// the binary.
//
// The general strategy to deal with this is to wait a short time for more write
// events, resetting the wait period for every new event.
func watchAndBuild(cfg *yaml.YAML) {

	Build(cfg)

	// Create a new watcher.
	w, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Printf("creating a new watcher: %s", err)
		os.Exit(1)
	}
	defer w.Close()

	// Start listening for events.
	go dedupLoop(w, cfg)

	pageSources := path.Join(cfg.String("sourcedir"), cfg.String("pagedir"))

	err = w.Add(pageSources)
	if err != nil {
		fmt.Printf("%q: %s", pageSources, err)
		os.Exit(1)
	}

	printTime("ready; press ^C to exit")
	<-make(chan struct{}) // Block forever
}

func printTime(s string, args ...interface{}) {
	fmt.Printf(time.Now().Format("15:04:05.0000")+" "+s+"\n", args...)
}

func dedupLoop(w *fsnotify.Watcher, cfg *yaml.YAML) {
	var (
		// Wait 100ms for new events; each new event resets the timer.
		waitFor = 100 * time.Millisecond

		// Keep track of the timers, as path → timer.
		mu     sync.Mutex
		timers = make(map[string]*time.Timer)

		// Callback we run.
		printEvent = func(e fsnotify.Event) {
			printTime(e.String())
			Build(cfg)

			// Don't need to remove the timer if you don't have a lot of files.
			mu.Lock()
			delete(timers, e.Name)
			mu.Unlock()
		}
	)

	for {
		select {
		// Read from Errors.
		case err, ok := <-w.Errors:
			if !ok { // Channel was closed (i.e. Watcher.Close() was called).
				return
			}
			printTime("ERROR: %s", err)
		// Read from Events.
		case e, ok := <-w.Events:
			if !ok { // Channel was closed (i.e. Watcher.Close() was called).
				return
			}

			// We just want to watch for file creation, so ignore everything
			// outside of Create and Write.
			if !e.Has(fsnotify.Create) && !e.Has(fsnotify.Write) {
				continue
			}

			// Get timer.
			mu.Lock()
			t, ok := timers[e.Name]
			mu.Unlock()

			// No timer yet, so create one.
			if !ok {
				t = time.AfterFunc(math.MaxInt64, func() { printEvent(e) })
				t.Stop()

				mu.Lock()
				timers[e.Name] = t
				mu.Unlock()
			}

			// Reset the timer for this path, so it will start from 100ms again.
			t.Reset(waitFor)
		}
	}
}
