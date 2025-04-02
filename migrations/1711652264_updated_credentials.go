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

		// add
		new_decoded := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "wjm5egpf",
			"name": "decoded",
			"type": "json",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"maxSize": 2000000
			}
		}`), new_decoded); err != nil {
			return err
		}
		collection.Schema.AddField(new_decoded)

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("8sflyv4gzaox8yp")
		if err != nil {
			return err
		}

		// remove
		collection.Schema.RemoveField("wjm5egpf")

		return dao.SaveCollection(collection)
	})
}
