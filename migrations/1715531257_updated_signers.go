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

		// remove
		collection.Schema.RemoveField("fmyyrfsx")

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("3s3s494hselzuzl")
		if err != nil {
			return err
		}

		// add
		del_privatekeyPem := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
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
		}`), del_privatekeyPem); err != nil {
			return err
		}
		collection.Schema.AddField(del_privatekeyPem)

		return dao.SaveCollection(collection)
	})
}
