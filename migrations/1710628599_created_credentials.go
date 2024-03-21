package migrations

import (
	"encoding/json"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
)

func init() {
	m.Register(func(db dbx.Builder) error {
		jsonData := `{
			"id": "8sflyv4gzaox8yp",
			"created": "2024-03-16 22:36:39.225Z",
			"updated": "2024-03-16 22:36:39.225Z",
			"name": "credentials",
			"type": "base",
			"system": false,
			"schema": [
				{
					"system": false,
					"id": "w7enstxq",
					"name": "status",
					"type": "select",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"maxSelect": 1,
						"values": [
							"offered",
							"tobesigned",
							"signed"
						]
					}
				},
				{
					"system": false,
					"id": "ildst6yf",
					"name": "email",
					"type": "email",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"exceptDomains": null,
						"onlyDomains": null
					}
				},
				{
					"system": false,
					"id": "1e1zteqx",
					"name": "type",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": null,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "5tcniqt6",
					"name": "raw",
					"type": "json",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"maxSize": 2000000
					}
				},
				{
					"system": false,
					"id": "0yboisej",
					"name": "creator_email",
					"type": "email",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"exceptDomains": null,
						"onlyDomains": null
					}
				},
				{
					"system": false,
					"id": "vsl6yaef",
					"name": "signer_email",
					"type": "email",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"exceptDomains": null,
						"onlyDomains": null
					}
				}
			],
			"indexes": [],
			"listRule": "@request.auth.verified = true && @request.auth.email = email",
			"viewRule": "@request.auth.verified = true && @request.auth.email = email",
			"createRule": "@request.auth.verified = true && @request.data.creator_email = @request.auth.email",
			"updateRule": "@request.auth.verified = true && @request.data.signer_email = @request.auth.email",
			"deleteRule": "@request.auth.verified = true && @request.data.creator_email = @request.auth.email",
			"options": {}
		}`

		collection := &models.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return daos.New(db).SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("8sflyv4gzaox8yp")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
