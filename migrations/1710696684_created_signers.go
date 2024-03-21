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
			"id": "3s3s494hselzuzl",
			"created": "2024-03-17 17:31:24.522Z",
			"updated": "2024-03-17 17:31:24.522Z",
			"name": "signers",
			"type": "auth",
			"system": false,
			"schema": [
				{
					"system": false,
					"id": "clmfabu7",
					"name": "name",
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
					"id": "u23csjro",
					"name": "avatar",
					"type": "file",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"mimeTypes": [
							"image/jpeg",
							"image/png",
							"image/svg+xml",
							"image/gif",
							"image/webp"
						],
						"thumbs": null,
						"maxSelect": 1,
						"maxSize": 5242880,
						"protected": false
					}
				},
				{
					"system": false,
					"id": "7boukfkm",
					"name": "organizationIdentifier",
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
					"id": "ic7fykhm",
					"name": "organization",
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
					"id": "hvzo8mcr",
					"name": "commonName",
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
					"id": "mlmbqqvs",
					"name": "serialNumber",
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
					"id": "jhaj96md",
					"name": "country",
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
					"id": "zhjlgc2n",
					"name": "certificatePem",
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
					"id": "fmyyrfsx",
					"name": "privatekeyPem",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": null,
						"pattern": ""
					}
				}
			],
			"indexes": [],
			"listRule": "id = @request.auth.id",
			"viewRule": "id = @request.auth.id",
			"createRule": "",
			"updateRule": "id = @request.auth.id",
			"deleteRule": "id = @request.auth.id",
			"options": {
				"allowEmailAuth": true,
				"allowOAuth2Auth": false,
				"allowUsernameAuth": false,
				"exceptEmailDomains": null,
				"manageRule": null,
				"minPasswordLength": 8,
				"onlyEmailDomains": null,
				"onlyVerified": true,
				"requireEmail": true
			}
		}`

		collection := &models.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return daos.New(db).SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("3s3s494hselzuzl")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
