package migrations

import (
	"encoding/json"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models/schema"
)

func init() {
	m.Register(func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("3s3s494hselzuzl")
		if err != nil {
			return err
		}

		// add
		new_street := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "ulnbuhjl",
			"name": "street",
			"type": "text",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"pattern": ""
			}
		}`), new_street); err != nil {
			return err
		}
		collection.Schema.AddField(new_street)

		// add
		new_city := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "1iezfdip",
			"name": "city",
			"type": "text",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"pattern": ""
			}
		}`), new_city); err != nil {
			return err
		}
		collection.Schema.AddField(new_city)

		// add
		new_postalCode := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "tzb4izor",
			"name": "postalCode",
			"type": "text",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"pattern": ""
			}
		}`), new_postalCode); err != nil {
			return err
		}
		collection.Schema.AddField(new_postalCode)

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("3s3s494hselzuzl")
		if err != nil {
			return err
		}

		// remove
		collection.Schema.RemoveField("ulnbuhjl")

		// remove
		collection.Schema.RemoveField("1iezfdip")

		// remove
		collection.Schema.RemoveField("tzb4izor")

		return dao.SaveCollection(collection)
	})
}
