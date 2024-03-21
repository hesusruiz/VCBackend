package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("8sflyv4gzaox8yp")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("@request.auth.verified = true && (@request.auth.email = email || @request.auth.email = creator_email)")

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("8sflyv4gzaox8yp")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("@request.auth.verified = true && @request.auth.email = email")

		return dao.SaveCollection(collection)
	})
}
