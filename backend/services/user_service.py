from ..models import User

def get_user_by_id(user_id):
    """
    Retorna um objeto User pelo seu ID.
    """
    return User.query.get(user_id)

def get_user_by_email(email):
    """
    Retorna um objeto User pelo seu email.
    """
    return User.query.filter_by(email=email).first()
