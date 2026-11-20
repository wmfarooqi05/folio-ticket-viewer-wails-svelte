package docs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// NoLinksBelow checks every path component of target below root (target included, root not) with
// Lstat: none may be a symlink or junction, and target must be a folder. It returns an error
// wrapping fs.ErrNotExist when a component is missing (nothing to delete). Clear data uses it so a
// link in the middle of the path cannot redirect a delete.
func NoLinksBelow(root, target string) error {
	root, target = filepath.Clean(root), filepath.Clean(target)
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("%s is not below %s", target, root)
	}
	cur := root
	for _, part := range strings.Split(rel, string(filepath.Separator)) {
		cur = filepath.Join(cur, part)
		st, err := os.Lstat(cur)
		if err != nil {
			return err
		}
		if st.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			return fmt.Errorf("%s is a link", cur)
		}
		if cur == target && !st.IsDir() {
			return fmt.Errorf("%s is not a folder", cur)
		}
	}
	return nil
}
