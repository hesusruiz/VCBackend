package wallet

import (
	"log"
	"net/http"

	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

func Start(cfg *yaml.YAML) {
	listenAddress := cfg.String("listenAddress", "0.0.0.0:8090")

	go func() {
		app := pocketbase.New()
		app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
			log.Println("Hola after Bootstrap!!!!")

			dao := e.App.Dao()

			// The default Settings
			settings, _ := dao.FindSettings()
			settings.Meta.AppName = "DOME Issuer"
			settings.Meta.AppUrl = "wallettest.mycredential.eu"
			settings.Logs.MaxDays = 2

			settings.Meta.SenderName = "Support"
			settings.Meta.SenderAddress = "admin@mycredential.eu"

			settings.Smtp.Enabled = true
			settings.Smtp.Host = "smtp.serviciodecorreo.es"
			settings.Smtp.Port = 465
			settings.Smtp.Tls = true
			settings.Smtp.Username = "admin@mycredential.eu"
			settings.Smtp.Password = "Lornac1100"

			err := dao.SaveSettings(settings)
			if err != nil {
				return err
			}
			log.Println("Settings updated!!!!")

			// The default admin
			admin := &models.Admin{}
			admin.Email = "jesus@alastria.io"
			admin.SetPassword("1234567890")

			if dao.IsAdminEmailUnique(admin.Email) {
				err = dao.SaveAdmin(admin)
				if err != nil {
					return err
				}
				log.Println("Default Admin added!!!!")
			} else {
				log.Println("Default Admin already existed!!!!")
			}

			return nil
		})

		app.OnRecordBeforeAuthWithPasswordRequest().Add(func(e *core.RecordAuthWithPasswordEvent) error {
			log.Println("Entered OnRecordBeforeAuthWithPasswordRequest")
			log.Println(e.HttpContext)
			log.Println(e.Record) // could be nil
			log.Println(e.Identity)
			log.Println(e.Password)
			return nil
		})

		handlers.NewWebAuthnHandlerPB(app, cfg)

		log.Println("Hola Antes del Bootstrap!!!!")
		if err := app.Bootstrap(); err != nil {
			log.Fatal(err)
		}

		log.Println("Hola Antes de llamar a Serve!!!!")
		_, err := apis.Serve(app, apis.ServeConfig{
			HttpAddr:        listenAddress,
			ShowStartBanner: true,
		})

		if err != http.ErrServerClosed {
			log.Fatalln(err)
		}

	}()

}
