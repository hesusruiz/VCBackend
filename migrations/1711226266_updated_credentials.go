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

		collection, err := dao.FindCollectionByNameOrId("8sflyv4gzaox8yp")
		if err != nil {
			return err
		}

		// remove
		collection.Schema.RemoveField("5tcniqt6")

		// add
		new_raw := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "yr1iwqyp",
			"name": "raw",
			"type": "text",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"pattern": ""
			}
		}`), new_raw); err != nil {
			return err
		}
		collection.Schema.AddField(new_raw)

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("8sflyv4gzaox8yp")
		if err != nil {
			return err
		}

		// add
		del_raw := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
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
		}`), del_raw); err != nil {
			return err
		}
		collection.Schema.AddField(del_raw)

		// remove
		collection.Schema.RemoveField("yr1iwqyp")

		return dao.SaveCollection(collection)
	})
}
