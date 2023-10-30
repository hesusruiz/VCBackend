package wallet

import (
	"log"
	"net/http"

	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

func Start(cfg *yaml.YAML) {

	go func() {
		app := pocketbase.New()

		handlers.NewWebAuthnHandlerPB(app, cfg)

		if err := app.Bootstrap(); err != nil {
			log.Fatal(err)
		}

		_, err := apis.Serve(app, apis.ServeConfig{
			HttpAddr:        "0.0.0.0:8090",
			ShowStartBanner: true,
		})

		if err != http.ErrServerClosed {
			log.Fatalln(err)
		}

	}()

}
