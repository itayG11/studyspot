"""Admin command line, for the first administrator of an institution.

Usage:
  python -m app.admin grant-role --email someone@e.braude.ac.il institution_admin
  python -m app.admin grant-role --user-id 12 student
The user must have signed in at least once.
"""

import argparse
import sys

from sqlalchemy import select

from app.db import SessionLocal, get_engine
from app.models import User, UserRole


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.admin")
    commands = parser.add_subparsers(dest="command", required=True)
    grant = commands.add_parser("grant-role", help="set a user's role")
    who = grant.add_mutually_exclusive_group(required=True)
    who.add_argument("--email")
    who.add_argument("--user-id", type=int)
    grant.add_argument("role", choices=[r.value for r in UserRole])
    args = parser.parse_args(argv)

    with SessionLocal(bind=get_engine()) as db:
        if args.user_id is not None:
            users = [u for u in [db.get(User, args.user_id)] if u is not None]
        else:
            users = list(db.scalars(select(User).where(User.email == args.email.lower())))
        if len(users) != 1:
            # Emails are not unique (a person may sign in with two providers).
            ids = ", ".join(str(u.id) for u in users) or "none"
            print(f"expected exactly one user, found: {ids}. Use --user-id.", file=sys.stderr)
            return 1
        users[0].role = UserRole(args.role)
        db.commit()
        print(f"user {users[0].id} ({users[0].email}) is now {args.role}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
